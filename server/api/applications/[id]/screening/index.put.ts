import { and, eq } from 'drizzle-orm'
import { application, recruiterScreeningSession } from '../../../../database/schema'
import { upsertScreeningSchema } from '../../../../utils/schemas/recruitmentWorkflow'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { id: applicationId } = await getValidatedRouterParams(event, paramsSchema.parse)
  const body = await readValidatedBody(event, upsertScreeningSchema.parse)

  const app = await db.query.application.findFirst({
    where: and(eq(application.id, applicationId), eq(application.organizationId, orgId)),
    columns: { id: true },
  })
  if (!app) throw createError({ statusCode: 404, statusMessage: 'Application not found' })

  const existing = await db.query.recruiterScreeningSession.findFirst({
    where: and(eq(recruiterScreeningSession.applicationId, applicationId), eq(recruiterScreeningSession.organizationId, orgId)),
  })

  const now = new Date()
  const values = {
    ...body,
    updatedAt: now,
    ...(body.status === 'in_progress' && !existing?.startedAt ? { startedAt: now } : {}),
    ...(body.status === 'completed' ? { completedAt: now } : {}),
  }

  let screening
  if (existing) {
    ;[screening] = await db.update(recruiterScreeningSession)
      .set(values)
      .where(eq(recruiterScreeningSession.id, existing.id))
      .returning()
  } else {
    ;[screening] = await db.insert(recruiterScreeningSession)
      .values({
        organizationId: orgId,
        applicationId,
        status: body.status ?? 'not_started',
        questions: body.questions ?? [],
        responses: body.responses ?? [],
        validationFocus: body.validationFocus ?? [],
        ...values,
      })
      .returning()
  }

  return { screening }
})
