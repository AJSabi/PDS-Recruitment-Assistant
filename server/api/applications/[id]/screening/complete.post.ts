import { and, eq } from 'drizzle-orm'
import { recruiterScreeningSession, recruitmentApplicationProfile, recruitmentEvidence, recruitmentRequirementState } from '../../../../database/schema'
import { completeScreeningSchema } from '../../../../utils/schemas/recruitmentWorkflow'
import { syncApplicationStatusForRecruitmentStage } from '../../../../utils/recruitmentApplicationStatus'
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
  const now = new Date()

  const [updatedScreening] = await db.update(recruiterScreeningSession).set({ status: 'completed', finalFit: body.finalFit, recommendedNextStep: body.recommendedNextStep, validationFocus: body.validationFocus, completedAt: now, updatedAt: now }).where(eq(recruiterScreeningSession.id, screening.id)).returning()

  await db.update(recruitmentApplicationProfile).set({
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
  }).where(eq(recruitmentApplicationProfile.id, profile.id))

  await syncApplicationStatusForRecruitmentStage(orgId, applicationId, finalStatus)
  await db.insert(recruitmentEvidence).values({
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
