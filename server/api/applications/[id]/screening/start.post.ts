import { and, eq } from 'drizzle-orm'
import { application, recruiterScreeningSession, recruitmentApplicationProfile, recruitmentEvidence } from '../../../../database/schema'
import { startScreeningSchema } from '../../../../utils/schemas/recruitmentWorkflow'
import { coarseStatusForRecruitmentStage } from '../../../../utils/recruitmentApplicationStatus'
import { assertApplicationAccess } from '../../../../utils/recruitmentVisibility'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })
const allowedStartStatuses = new Set(['resume_reviewed', 'reassess', 'recruiter_screening_pending'])

type ScreeningQuestion = { id: string; question: string; options?: string[]; verificationArea?: string }
type ScreeningResponse = { questionId: string; answer: string; answeredAt?: string }

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { id: applicationId } = await getValidatedRouterParams(event, paramsSchema.parse)
  await assertApplicationAccess(orgId, session.user.id, applicationId)
  const body = await readValidatedBody(event, startScreeningSchema.parse)

  const profile = await db.query.recruitmentApplicationProfile.findFirst({
    where: and(eq(recruitmentApplicationProfile.applicationId, applicationId), eq(recruitmentApplicationProfile.organizationId, orgId)),
  })
  if (!profile) throw createError({ statusCode: 404, statusMessage: 'Recruitment profile not found' })
  if (!allowedStartStatuses.has(profile.lastStatus)) throw createError({ statusCode: 422, statusMessage: `Recruiter screening cannot start while candidate status is ${profile.lastStatus}. Resume a held candidate through the recorded continuation point or choose Reassess first.` })

  const existing = await db.query.recruiterScreeningSession.findFirst({
    where: and(eq(recruiterScreeningSession.applicationId, applicationId), eq(recruiterScreeningSession.organizationId, orgId)),
  })
  if (existing?.status === 'completed' && profile.lastStatus !== 'reassess') throw createError({ statusCode: 409, statusMessage: 'Screening is already completed. Confirm Reassess before starting another screening.' })

  // Starting an already-active screening must be idempotent. A repeated click or retried
  // request must never clear answers that have already been captured.
  if (existing?.status === 'in_progress' && profile.lastStatus === 'recruiter_screening_pending') {
    const questions = (existing.questions ?? []) as ScreeningQuestion[]
    const responses = (existing.responses ?? []) as ScreeningResponse[]
    const answeredIds = new Set(responses.map(response => response.questionId))
    const currentQuestion = questions.find(question => !answeredIds.has(question.id)) ?? null
    return {
      screening: existing,
      currentQuestion,
      progress: { answered: responses.length, total: questions.length },
      resumed: true,
    }
  }

  const now = new Date()
  const coarseStatus = coarseStatusForRecruitmentStage('recruiter_screening_pending')
  const screening = await db.transaction(async (tx) => {
    let screeningRow
    if (existing) {
      const priorResponses = Array.isArray(existing.responses) ? existing.responses : []
      if (priorResponses.length) {
        await tx.insert(recruitmentEvidence).values({
          organizationId: orgId,
          applicationId,
          type: 'recruiter_screening',
          summary: 'Prior recruiter screening preserved before reassessment restart.',
          payload: {
            snapshotReason: 'pre_restart_snapshot',
            priorStatus: existing.status,
            priorQuestions: existing.questions ?? [],
            priorResponses,
            priorFinalFit: existing.finalFit ?? null,
            priorRecommendedNextStep: existing.recommendedNextStep ?? null,
            priorConversationBrief: existing.conversationBrief ?? null,
            priorValidationFocus: existing.validationFocus ?? [],
            priorStartedAt: existing.startedAt?.toISOString?.() ?? existing.startedAt ?? null,
            priorCompletedAt: existing.completedAt?.toISOString?.() ?? existing.completedAt ?? null,
          },
          createdBy: session.user.id,
        })
      }
      ;[screeningRow] = await tx.update(recruiterScreeningSession).set({
        questions: body.questions,
        responses: [],
        status: 'in_progress',
        finalFit: null,
        recommendedNextStep: null,
        validationFocus: [],
        startedAt: now,
        completedAt: null,
        updatedAt: now,
      }).where(and(
        eq(recruiterScreeningSession.id, existing.id),
        eq(recruiterScreeningSession.organizationId, orgId),
        eq(recruiterScreeningSession.status, existing.status),
        eq(recruiterScreeningSession.updatedAt, existing.updatedAt),
      )).returning()
      if (!screeningRow) throw createError({ statusCode: 409, statusMessage: 'Screening changed before it could be restarted. Refresh and try again.' })
    } else {
      ;[screeningRow] = await tx.insert(recruiterScreeningSession).values({
        organizationId: orgId,
        applicationId,
        status: 'in_progress',
        questions: body.questions,
        responses: [],
        validationFocus: [],
        startedAt: now,
      }).returning()
    }

    const [profileUpdated] = await tx.update(recruitmentApplicationProfile).set({
      lastStatus: 'recruiter_screening_pending',
      statusDate: now,
      nextAction: 'Complete recruiter screening',
      lastUpdatedBy: session.user.id,
      updatedAt: now,
    }).where(and(
      eq(recruitmentApplicationProfile.id, profile.id),
      eq(recruitmentApplicationProfile.organizationId, orgId),
      eq(recruitmentApplicationProfile.lastStatus, profile.lastStatus),
    )).returning({ id: recruitmentApplicationProfile.id })
    if (!profileUpdated) throw createError({ statusCode: 409, statusMessage: 'Recruitment profile changed before screening could be started. Refresh and try again.' })

    if (coarseStatus) {
      const [applicationUpdated] = await tx.update(application)
        .set({ status: coarseStatus, updatedAt: now })
        .where(and(eq(application.id, applicationId), eq(application.organizationId, orgId)))
        .returning({ id: application.id })
      if (!applicationUpdated) throw createError({ statusCode: 409, statusMessage: 'Application changed before screening could be started. Refresh and try again.' })
    }

    if (profile.lastStatus !== 'recruiter_screening_pending') {
      await tx.insert(recruitmentEvidence).values({
        organizationId: orgId,
        applicationId,
        type: 'stage_change',
        summary: `Recruitment stage changed from ${profile.lastStatus} to recruiter_screening_pending`,
        payload: {
          event: 'stage_changed',
          from: profile.lastStatus,
          to: 'recruiter_screening_pending',
          source: 'screening_start',
        },
        createdBy: session.user.id,
      })
    }

    return screeningRow
  })

  return { screening, currentQuestion: body.questions[0], progress: { answered: 0, total: body.questions.length } }
})