import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { recruiterScreeningSession, recruitmentApplicationProfile } from '../../../../database/schema'
import { assertApplicationAccess } from '../../../../utils/recruitmentVisibility'

const paramsSchema = z.object({ id: z.string().min(1) })
const questionSchema = z.object({
  id: z.string().min(1).max(100),
  question: z.string().trim().min(1).max(1000),
  options: z.array(z.string().trim().min(1).max(300)).max(8).optional(),
  verificationArea: z.string().trim().max(500).optional(),
}).strict()
const bodySchema = z.object({ questions: z.array(questionSchema).min(1).max(10) }).strict()

type ScreeningQuestion = z.infer<typeof questionSchema>
type ScreeningResponse = { questionId: string; answer: string; answeredAt?: string }

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { id: applicationId } = await getValidatedRouterParams(event, paramsSchema.parse)
  await assertApplicationAccess(orgId, session.user.id, applicationId)
  const body = await readValidatedBody(event, bodySchema.parse)

  const profile = await db.query.recruitmentApplicationProfile.findFirst({
    where: and(eq(recruitmentApplicationProfile.applicationId, applicationId), eq(recruitmentApplicationProfile.organizationId, orgId)),
    columns: { lastStatus: true },
  })
  if (!profile) throw createError({ statusCode: 404, statusMessage: 'Recruitment profile not found' })
  if (profile.lastStatus !== 'recruiter_screening_pending') {
    throw createError({ statusCode: 422, statusMessage: 'Screening questions can only be adjusted while Recruiter Screening is in progress.' })
  }

  const screening = await db.query.recruiterScreeningSession.findFirst({
    where: and(eq(recruiterScreeningSession.applicationId, applicationId), eq(recruiterScreeningSession.organizationId, orgId)),
  })
  if (!screening) throw createError({ statusCode: 404, statusMessage: 'Screening session not started' })
  if (screening.status !== 'in_progress') throw createError({ statusCode: 409, statusMessage: 'Screening is not in progress' })

  const existingQuestions = (screening.questions ?? []) as ScreeningQuestion[]
  const responses = (screening.responses ?? []) as ScreeningResponse[]
  const answeredIds = new Set(responses.map(response => response.questionId))
  const proposedById = new Map(body.questions.map(question => [question.id, question]))

  for (const answeredId of answeredIds) {
    const existing = existingQuestions.find(question => question.id === answeredId)
    const proposed = proposedById.get(answeredId)
    if (!existing || !proposed || proposed.question !== existing.question) {
      throw createError({ statusCode: 422, statusMessage: 'Questions that have already been answered cannot be removed or changed.' })
    }
  }

  const ids = body.questions.map(question => question.id)
  if (new Set(ids).size !== ids.length) throw createError({ statusCode: 422, statusMessage: 'Screening question IDs must be unique.' })

  const [updated] = await db.update(recruiterScreeningSession).set({
    questions: body.questions,
    updatedAt: new Date(),
  }).where(eq(recruiterScreeningSession.id, screening.id)).returning()

  return {
    screening: updated,
    progress: { answered: responses.length, total: body.questions.length },
    changed: true,
  }
})
