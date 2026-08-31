import { and, eq } from 'drizzle-orm'
import { recruiterScreeningSession, recruitmentApplicationProfile } from '../../../../database/schema'
import { assertApplicationAccess } from '../../../../utils/recruitmentVisibility'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })
type ScreeningQuestion = { id: string; question: string; options?: string[]; verificationArea?: string }
type ScreeningResponse = { questionId: string; answer: string; answeredAt?: string }

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { id: applicationId } = await getValidatedRouterParams(event, paramsSchema.parse)
  await assertApplicationAccess(orgId, session.user.id, applicationId)

  const [profile, screening] = await Promise.all([
    db.query.recruitmentApplicationProfile.findFirst({
      where: and(eq(recruitmentApplicationProfile.applicationId, applicationId), eq(recruitmentApplicationProfile.organizationId, orgId)),
      columns: { lastStatus: true },
    }),
    db.query.recruiterScreeningSession.findFirst({
      where: and(eq(recruiterScreeningSession.applicationId, applicationId), eq(recruiterScreeningSession.organizationId, orgId)),
    }),
  ])

  if (!profile) throw createError({ statusCode: 404, statusMessage: 'Recruitment profile not found' })
  if (profile.lastStatus !== 'recruiter_screening_pending') throw createError({ statusCode: 422, statusMessage: 'Candidate is not currently in Recruiter Screening Pending status.' })
  if (!screening) throw createError({ statusCode: 404, statusMessage: 'Screening session not started' })
  if (screening.status !== 'in_progress') throw createError({ statusCode: 409, statusMessage: 'Screening is not in progress' })

  const questions = [...((screening.questions ?? []) as ScreeningQuestion[])]
  const responses = [...((screening.responses ?? []) as ScreeningResponse[])]
  if (!responses.length) throw createError({ statusCode: 409, statusMessage: 'There is no previous screening response to revisit.' })

  const removedResponse = responses.at(-1)
  if (!removedResponse) throw createError({ statusCode: 409, statusMessage: 'There is no previous screening response to revisit.' })

  const previousResponses = responses.slice(0, -1)
  const injectedFollowUpId = `${removedResponse.questionId}_followup_${responses.length}`
  const restoredQuestions = questions.filter(question => question.id !== injectedFollowUpId)
  const answeredIds = new Set(previousResponses.map(response => response.questionId))
  const currentQuestion = restoredQuestions.find(question => !answeredIds.has(question.id)) ?? null
  const now = new Date()

  const [updated] = await db.update(recruiterScreeningSession)
    .set({ responses: previousResponses, questions: restoredQuestions, updatedAt: now })
    .where(eq(recruiterScreeningSession.id, screening.id))
    .returning()

  return {
    screening: updated,
    currentQuestion,
    readyToComplete: false,
    progress: { answered: previousResponses.length, total: restoredQuestions.length },
    restoredQuestionId: removedResponse.questionId,
    removedAdaptiveFollowUp: restoredQuestions.length !== questions.length,
  }
})
