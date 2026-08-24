import { and, eq } from 'drizzle-orm'
import { application, recruiterScreeningSession } from '../../../../../database/schema'
import { answerScreeningQuestionSchema } from '../../../../../utils/schemas/recruitmentWorkflow'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })
type ScreeningQuestion = { id: string; question: string; options?: string[]; verificationArea?: string }
type ScreeningResponse = { questionId: string; answer: string; answeredAt?: string }

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { id: applicationId } = await getValidatedRouterParams(event, paramsSchema.parse)
  const body = await readValidatedBody(event, answerScreeningQuestionSchema.parse)

  const app = await db.query.application.findFirst({
    where: and(eq(application.id, applicationId), eq(application.organizationId, orgId)),
    columns: { id: true },
  })
  if (!app) throw createError({ statusCode: 404, statusMessage: 'Application not found' })

  const screening = await db.query.recruiterScreeningSession.findFirst({
    where: and(eq(recruiterScreeningSession.applicationId, applicationId), eq(recruiterScreeningSession.organizationId, orgId)),
  })
  if (!screening) throw createError({ statusCode: 404, statusMessage: 'Screening session not started' })
  if (screening.status !== 'in_progress') throw createError({ statusCode: 409, statusMessage: 'Screening is not in progress' })

  const questions = (screening.questions ?? []) as ScreeningQuestion[]
  const responses = (screening.responses ?? []) as ScreeningResponse[]
  const answeredIds = new Set(responses.map(r => r.questionId))
  const nextQuestion = questions.find(q => !answeredIds.has(q.id))

  if (!nextQuestion) throw createError({ statusCode: 409, statusMessage: 'All screening questions are already answered. Complete the screening.' })
  if (body.questionId !== nextQuestion.id) {
    throw createError({ statusCode: 422, statusMessage: 'Answer the current screening question before moving to the next question.' })
  }

  const updatedResponses: ScreeningResponse[] = [...responses, {
    questionId: body.questionId,
    answer: body.answer,
    answeredAt: new Date().toISOString(),
  }]

  const [updated] = await db.update(recruiterScreeningSession).set({
    responses: updatedResponses,
    updatedAt: new Date(),
  }).where(eq(recruiterScreeningSession.id, screening.id)).returning()

  const answered = updatedResponses.length
  const next = questions[answered] ?? null

  return {
    screening: updated,
    currentQuestion: next,
    readyToComplete: answered === questions.length,
    progress: { answered, total: questions.length },
  }
})
