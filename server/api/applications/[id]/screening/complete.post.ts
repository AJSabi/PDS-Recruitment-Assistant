import { and, eq } from 'drizzle-orm'
import { application, recruiterScreeningSession, recruitmentApplicationProfile, recruitmentEvidence } from '../../../../database/schema'
import { completeScreeningSchema } from '../../../../utils/schemas/recruitmentWorkflow'
import { syncApplicationStatusForRecruitmentStage } from '../../../../utils/recruitmentApplicationStatus'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })
type ScreeningQuestion = { id: string; question: string; options?: string[]; verificationArea?: string }
type ScreeningResponse = { questionId: string; answer: string; answeredAt?: string }

const nextActionLabels: Record<string, string> = {
  proceed_to_hod_round: 'Proceed to HOD Round',
  hold_for_comparison: 'Hold for Comparison',
  reassess: 'Reassess',
  recruiter_decision_required: 'Recruiter Decision Required',
}

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { id: applicationId } = await getValidatedRouterParams(event, paramsSchema.parse)
  const body = await readValidatedBody(event, completeScreeningSchema.parse)

  const app = await db.query.application.findFirst({
    where: and(eq(application.id, applicationId), eq(application.organizationId, orgId)),
    columns: { id: true },
  })
  if (!app) throw createError({ statusCode: 404, statusMessage: 'Application not found' })

  const profile = await db.query.recruitmentApplicationProfile.findFirst({
    where: and(eq(recruitmentApplicationProfile.applicationId, applicationId), eq(recruitmentApplicationProfile.organizationId, orgId)),
  })
  if (!profile) throw createError({ statusCode: 404, statusMessage: 'Recruitment profile not found' })
  if (profile.lastStatus !== 'recruiter_screening_pending') {
    throw createError({ statusCode: 422, statusMessage: 'Candidate is not currently in Recruiter Screening Pending status.' })
  }

  const screening = await db.query.recruiterScreeningSession.findFirst({
    where: and(eq(recruiterScreeningSession.applicationId, applicationId), eq(recruiterScreeningSession.organizationId, orgId)),
  })
  if (!screening) throw createError({ statusCode: 404, statusMessage: 'Screening session not started' })
  if (screening.status === 'completed') throw createError({ statusCode: 409, statusMessage: 'Screening is already completed' })

  const questions = (screening.questions ?? []) as ScreeningQuestion[]
  const responses = (screening.responses ?? []) as ScreeningResponse[]
  const answeredIds = new Set(responses.map(r => r.questionId))
  const unanswered = questions.filter(q => !answeredIds.has(q.id))
  if (!questions.length || unanswered.length) {
    throw createError({ statusCode: 422, statusMessage: `Complete all screening questions before final assessment. ${unanswered.length} unanswered.` })
  }

  const now = new Date()
  const [updatedScreening] = await db.update(recruiterScreeningSession).set({
    status: 'completed',
    finalFit: body.finalFit,
    recommendedNextStep: body.recommendedNextStep,
    validationFocus: body.validationFocus,
    completedAt: now,
    updatedAt: now,
  }).where(eq(recruiterScreeningSession.id, screening.id)).returning()

  await db.update(recruitmentApplicationProfile).set({
    currentFit: body.finalFit,
    lastStatus: 'recruiter_screening_completed',
    statusDate: now,
    lastContactAt: now,
    conversationBrief: body.conversationBrief ?? profile.conversationBrief,
    nextAction: nextActionLabels[body.recommendedNextStep] ?? body.recommendedNextStep,
    assessmentLocked: true,
    lastUpdatedBy: session.user.id,
    updatedAt: now,
  }).where(eq(recruitmentApplicationProfile.id, profile.id))

  await syncApplicationStatusForRecruitmentStage(orgId, applicationId, 'recruiter_screening_completed')

  await db.insert(recruitmentEvidence).values({
    organizationId: orgId,
    applicationId,
    type: 'recruiter_screening',
    summary: body.conversationBrief ?? `Recruiter screening completed: ${body.finalFit}`,
    payload: {
      finalFit: body.finalFit,
      recommendedNextStep: body.recommendedNextStep,
      validationFocus: body.validationFocus,
      responses,
    },
    createdBy: session.user.id,
  })

  return {
    screening: updatedScreening,
    finalAssessment: {
      currentFit: body.finalFit,
      lastStatus: 'recruiter_screening_completed',
      recommendedNextStep: body.recommendedNextStep,
      validationFocus: body.validationFocus,
    },
  }
})
