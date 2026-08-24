import { and, eq } from 'drizzle-orm'
import { application, recruiterScreeningSession, recruitmentApplicationProfile } from '../../../../database/schema'
import { startScreeningSchema } from '../../../../utils/schemas/recruitmentWorkflow'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })
const allowedStartStatuses = new Set(['resume_reviewed', 'hold_for_comparison', 'reassess', 'recruiter_screening_pending'])

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { id: applicationId } = await getValidatedRouterParams(event, paramsSchema.parse)
  const body = await readValidatedBody(event, startScreeningSchema.parse)

  const app = await db.query.application.findFirst({
    where: and(eq(application.id, applicationId), eq(application.organizationId, orgId)),
    columns: { id: true },
  })
  if (!app) throw createError({ statusCode: 404, statusMessage: 'Application not found' })

  const profile = await db.query.recruitmentApplicationProfile.findFirst({
    where: and(eq(recruitmentApplicationProfile.applicationId, applicationId), eq(recruitmentApplicationProfile.organizationId, orgId)),
  })
  if (!profile) throw createError({ statusCode: 404, statusMessage: 'Recruitment profile not found' })
  if (!allowedStartStatuses.has(profile.lastStatus)) {
    throw createError({ statusCode: 422, statusMessage: `Recruiter screening cannot start while candidate status is ${profile.lastStatus}.` })
  }

  const existing = await db.query.recruiterScreeningSession.findFirst({
    where: and(eq(recruiterScreeningSession.applicationId, applicationId), eq(recruiterScreeningSession.organizationId, orgId)),
  })
  if (existing?.status === 'completed' && profile.lastStatus !== 'reassess') {
    throw createError({ statusCode: 409, statusMessage: 'Screening is already completed. Confirm Reassess before starting another screening.' })
  }

  const now = new Date()
  let screening
  if (existing) {
    ;[screening] = await db.update(recruiterScreeningSession).set({
      questions: body.questions,
      responses: [],
      status: 'in_progress',
      finalFit: null,
      recommendedNextStep: null,
      validationFocus: [],
      startedAt: now,
      completedAt: null,
      updatedAt: now,
    }).where(eq(recruiterScreeningSession.id, existing.id)).returning()
  } else {
    ;[screening] = await db.insert(recruiterScreeningSession).values({
      organizationId: orgId,
      applicationId,
      status: 'in_progress',
      questions: body.questions,
      responses: [],
      validationFocus: [],
      startedAt: now,
    }).returning()
  }

  await db.update(recruitmentApplicationProfile).set({
    lastStatus: 'recruiter_screening_pending',
    statusDate: now,
    nextAction: 'Complete recruiter screening',
    lastUpdatedBy: session.user.id,
    updatedAt: now,
  }).where(eq(recruitmentApplicationProfile.id, profile.id))

  return {
    screening,
    currentQuestion: body.questions[0],
    progress: { answered: 0, total: body.questions.length },
  }
})
