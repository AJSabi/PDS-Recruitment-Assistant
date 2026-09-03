import { and, eq } from 'drizzle-orm'
import { recruiterScreeningSession, recruitmentApplicationProfile } from '../../../../database/schema'
import { answerScreeningQuestionSchema } from '../../../../utils/schemas/recruitmentWorkflow'
import { assertApplicationAccess } from '../../../../utils/recruitmentVisibility'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })
type ScreeningFollowUp = { whenOption: string; question: string; options?: string[]; verificationArea?: string }
type ScreeningQuestion = { id: string; question: string; options?: string[]; verificationArea?: string; followUps?: ScreeningFollowUp[] }
type ScreeningResponse = { questionId: string; answer: string; answeredAt?: string }

function matchingFollowUp(question: ScreeningQuestion, answer: string) {
  return question.followUps?.find(followUp => answer === followUp.whenOption || answer.startsWith(`${followUp.whenOption}:`)) ?? null
}

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { id: applicationId } = await getValidatedRouterParams(event, paramsSchema.parse)
  await assertApplicationAccess(orgId, session.user.id, applicationId)
  const body = await readValidatedBody(event, answerScreeningQuestionSchema.parse)

  const profile = await db.query.recruitmentApplicationProfile.findFirst({
    where: and(eq(recruitmentApplicationProfile.applicationId, applicationId), eq(recruitmentApplicationProfile.organizationId, orgId)),
    columns: { lastStatus: true },
  })
  if (!profile) throw createError({ statusCode: 404, statusMessage: 'Recruitment profile not found' })
  if (profile.lastStatus !== 'recruiter_screening_pending') throw createError({ statusCode: 422, statusMessage: 'Candidate is not currently in Recruiter Screening Pending status.' })

  const screening = await db.query.recruiterScreeningSession.findFirst({
    where: and(eq(recruiterScreeningSession.applicationId, applicationId), eq(recruiterScreeningSession.organizationId, orgId)),
  })
  if (!screening) throw createError({ statusCode: 404, statusMessage: 'Screening session not started' })
  if (screening.status !== 'in_progress') throw createError({ statusCode: 409, statusMessage: 'Screening is not in progress' })

  const questions = (screening.questions ?? []) as ScreeningQuestion[]
  const responses = (screening.responses ?? []) as ScreeningResponse[]
  const answeredIds = new Set(responses.map(r => r.questionId))
  const currentIndex = questions.findIndex(q => !answeredIds.has(q.id))
  const currentQuestion = currentIndex >= 0 ? questions[currentIndex] : null

  if (!currentQuestion) throw createError({ statusCode: 409, statusMessage: 'All screening questions are already answered. Complete the screening.' })
  if (body.questionId !== currentQuestion.id) throw createError({ statusCode: 422, statusMessage: 'Answer the current screening question before moving to the next question.' })

  const updatedResponses: ScreeningResponse[] = [...responses, { questionId: body.questionId, answer: body.answer, answeredAt: new Date().toISOString() }]
  const updatedQuestions = [...questions]
  const followUp = matchingFollowUp(currentQuestion, body.answer)
  if (followUp && updatedQuestions.length < 10) {
    const followUpId = `${currentQuestion.id}_followup_${updatedResponses.length}`
    if (!updatedQuestions.some(q => q.id === followUpId)) {
      updatedQuestions.splice(currentIndex + 1, 0, {
        id: followUpId,
        question: followUp.question,
        options: followUp.options,
        verificationArea: followUp.verificationArea,
      })
    }
  }

  const now = new Date()
  const [updated] = await db.update(recruiterScreeningSession)
    .set({ responses: updatedResponses, questions: updatedQuestions, updatedAt: now })
    .where(eq(recruiterScreeningSession.id, screening.id))
    .returning()

  const newAnsweredIds = new Set(updatedResponses.map(r => r.questionId))
  const nextQuestion = updatedQuestions.find(q => !newAnsweredIds.has(q.id)) ?? null
  const answered = updatedResponses.length

  return {
    screening: updated,
    currentQuestion: nextQuestion,
    adaptiveFollowUpAdded: Boolean(followUp && updatedQuestions.length > questions.length),
    readyToComplete: !nextQuestion,
    progress: { answered, total: updatedQuestions.length },
  }
})
