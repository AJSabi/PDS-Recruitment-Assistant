import { and, eq } from 'drizzle-orm'
import { application, recruiterScreeningSession } from '../../../../database/schema'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })
type ScreeningQuestion = { id: string; question: string; options?: string[]; verificationArea?: string }
type ScreeningResponse = { questionId: string; answer: string; answeredAt?: string }

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['read'] })
  const orgId = session.session.activeOrganizationId
  const { id: applicationId } = await getValidatedRouterParams(event, paramsSchema.parse)

  const app = await db.query.application.findFirst({
    where: and(eq(application.id, applicationId), eq(application.organizationId, orgId)),
    columns: { id: true },
  })
  if (!app) throw createError({ statusCode: 404, statusMessage: 'Application not found' })

  const screening = await db.query.recruiterScreeningSession.findFirst({
    where: and(eq(recruiterScreeningSession.applicationId, applicationId), eq(recruiterScreeningSession.organizationId, orgId)),
  })

  if (!screening) {
    return {
      screening: { applicationId, status: 'not_started', questions: [], responses: [], validationFocus: [] },
      currentQuestion: null,
      readyToComplete: false,
      progress: { answered: 0, total: 0 },
    }
  }

  const questions = (screening.questions ?? []) as ScreeningQuestion[]
  const responses = (screening.responses ?? []) as ScreeningResponse[]
  const answeredIds = new Set(responses.map(r => r.questionId))
  const currentQuestion = screening.status === 'in_progress'
    ? questions.find(q => !answeredIds.has(q.id)) ?? null
    : null

  return {
    screening,
    currentQuestion,
    readyToComplete: screening.status === 'in_progress' && questions.length > 0 && responses.length === questions.length,
    progress: { answered: responses.length, total: questions.length },
  }
})
