import { and, eq } from 'drizzle-orm'
import { application, recruiterScreeningSession, recruitmentApplicationProfile, recruitmentEvidence, recruitmentRequirementState } from '../../../../database/schema'
import { completeScreeningSchema } from '../../../../utils/schemas/recruitmentWorkflow'
import { coarseStatusForRecruitmentStage } from '../../../../utils/recruitmentApplicationStatus'
import { refreshRequirementReassessmentFlag } from '../../../../utils/recruitmentLifecycle'
import { assertApplicationAccess } from '../../../../utils/recruitmentVisibility'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })
type ScreeningQuestion = { id: string; question: string; options?: string[]; verificationArea?: string }
type ScreeningResponse = { questionId: string; answer: string; answeredAt?: string }

type ScreeningCompletionStage = 'recruiter_screening_completed' | 'hold_for_comparison' | 'reassess'

const nextActionLabels: Record<string, string> = {
  proceed_to_hiring_manager_round: 'Proceed to Hiring Manager Round',
  hold_for_comparison: 'Resume Hiring Manager Round',
  reassess: 'Reassess',
  recruiter_decision_required: 'Recruiter Decision Required',
}

function completionStageForDecision(decision: string): ScreeningCompletionStage {
  if (decision === 'hold_for_comparison') return 'hold_for_comparison'
  if (decision === 'reassess') return 'reassess'
  return 'recruiter_screening_completed'
}

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { id: applicationId } = await getValidatedRouterParams(event, paramsSchema.parse)
  const app = await assertApplicationAccess(orgId, session.user.id, applicationId)
  const body = await readValidatedBody(event, completeScreeningSchema.parse)

  const profile = await db.query.recruitmentApplicationProfile.findFirst({
    where: and(eq(recruitmentApplicationProfile.applicationId, applicationId), eq(recruitmentApplicationProfile.organizationId, orgId)),
  })
  if (!profile) throw createError({ statusCode: 404, statusMessage: 'Recruitment profile not found' })
  if (profile.lastStatus !== 'recruiter_screening_pending') throw createError({ statusCode: 422, statusMessage: 'Candidate is not currently in Recruiter Screening Pending status.' })

  const screening = await db.query.recruiterScreeningSession.findFirst({
    where: and(eq(recruiterScreeningSession.applicationId, applicationId), eq(recruiterScreeningSession.organizationId, orgId)),
  })
  if (!screening) throw createError({ statusCode: 404, statusMessage: 'Screening session not started' })
  if (screening.status === 'completed') throw createError({ statusCode: 409, statusMessage: 'Screening is already completed' })

  const questions = (screening.questions ?? []) as ScreeningQuestion[]
  const responses = (screening.responses ?? []) as ScreeningResponse[]
  const answeredIds = new Set(responses.map(r => r.questionId))
  const unanswered = questions.filter(q => !answeredIds.has(q.id))
  if (!questions.length || unanswered.length) throw createError({ statusCode: 422, statusMessage: `Complete all screening questions before final assessment. ${unanswered.length} unanswered.` })

  const requirementState = await db.query.recruitmentRequirementState.findFirst({
    where: and(eq(recruitmentRequirementState.jobId, app.jobId), eq(recruitmentRequirementState.organizationId, orgId)),
  })
  const requirementRevision = requirementState?.revision ?? profile.requirementVersionAssessed
  const finalStatus = completionStageForDecision(body.recommendedNextStep)
  const coarseStatus = coarseStatusForRecruitmentStage(finalStatus)
  const now = new Date()

  const updatedScreening = await db.transaction(async (tx) => {
    const [screeningUpdated] = await tx.update(recruiterScreeningSession).set({
      status: 'completed',
      finalFit: body.finalFit,
      recommendedNextStep: body.recommendedNextStep,
      conversationBrief: body.conversationBrief ?? screening.conversationBrief,
      recruiterNotes: body.conversationBrief ?? screening.recruiterNotes,
      recommendation: body.recommendedNextStep,
      validationFocus: body.validationFocus,
      completedAt: now,
      updatedAt: now,
    }).where(and(
      eq(recruiterScreeningSession.id, screening.id),
      eq(recruiterScreeningSession.organizationId, orgId),
      eq(recruiterScreeningSession.status, screening.status),
    )).returning()
    if (!screeningUpdated) throw createError({ statusCode: 409, statusMessage: 'Screening changed before completion could be saved. Refresh and try again.' })

    const [profileUpdated] = await tx.update(recruitmentApplicationProfile).set({
      currentFit: body.finalFit,
      lastStatus: finalStatus,
      statusDate: now,
      lastContactAt: now,
      conversationBrief: body.conversationBrief ?? profile.conversationBrief,
      nextAction: nextActionLabels[body.recommendedNextStep] ?? body.recommendedNextStep,
      assessmentLocked: true,
      aiSummaryStale: true,
      requirementVersionAssessed: requirementRevision,
      lastUpdatedBy: session.user.id,
      updatedAt: now,
    }).where(and(
      eq(recruitmentApplicationProfile.id, profile.id),
      eq(recruitmentApplicationProfile.organizationId, orgId),
      eq(recruitmentApplicationProfile.lastStatus, profile.lastStatus),
    )).returning({ id: recruitmentApplicationProfile.id })
    if (!profileUpdated) throw createError({ statusCode: 409, statusMessage: 'Recruitment profile changed before screening completion could be saved. Refresh and try again.' })

    if (coarseStatus) {
      const [applicationUpdated] = await tx.update(application)
        .set({ status: coarseStatus, updatedAt: now })
        .where(and(eq(application.id, applicationId), eq(application.organizationId, orgId)))
        .returning({ id: application.id })
      if (!applicationUpdated) throw createError({ statusCode: 409, statusMessage: 'Application changed before screening completion could be saved. Refresh and try again.' })
    }

    await tx.insert(recruitmentEvidence).values({
      organizationId: orgId,
      applicationId,
      type: 'stage_change',
      summary: body.conversationBrief?.trim() || `Recruitment stage changed from ${profile.lastStatus} to ${finalStatus}`,
      payload: {
        event: 'stage_changed',
        from: profile.lastStatus,
        to: finalStatus,
        source: 'screening_completion',
        finalFit: body.finalFit,
        recommendedNextStep: body.recommendedNextStep,
        requirementRevision,
        ...(finalStatus === 'hold_for_comparison' ? { holdResumeStage: 'hiring_manager_round_pending' } : {}),
      },
      createdBy: session.user.id,
    })

    await tx.insert(recruitmentEvidence).values({
      organizationId: orgId,
      applicationId,
      type: 'recruiter_screening',
      summary: body.conversationBrief ?? `Recruiter screening completed: ${body.finalFit}`,
      payload: {
        finalFit: body.finalFit,
        recommendedNextStep: body.recommendedNextStep,
        resultingStage: finalStatus,
        ...(finalStatus === 'hold_for_comparison' ? { holdResumeStage: 'hiring_manager_round_pending' } : {}),
        validationFocus: body.validationFocus,
        responses,
        requirementRevision,
      },
      createdBy: session.user.id,
    })

    return screeningUpdated
  })

  await refreshRequirementReassessmentFlag(orgId, app.jobId)

  return {
    screening: updatedScreening,
    finalAssessment: {
      currentFit: body.finalFit,
      lastStatus: finalStatus,
      recommendedNextStep: body.recommendedNextStep,
      validationFocus: body.validationFocus,
      requirementRevision,
    },
  }
})