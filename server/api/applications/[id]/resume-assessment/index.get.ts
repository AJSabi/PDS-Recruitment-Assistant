import { and, eq } from 'drizzle-orm'
import { application, resumeAssessment } from '../../../../database/schema'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['read'] })
  const orgId = session.session.activeOrganizationId
  const { id: applicationId } = await getValidatedRouterParams(event, paramsSchema.parse)

  const app = await db.query.application.findFirst({
    where: and(eq(application.id, applicationId), eq(application.organizationId, orgId)),
    columns: { id: true },
  })
  if (!app) throw createError({ statusCode: 404, statusMessage: 'Application not found' })

  const assessment = await db.query.resumeAssessment.findFirst({
    where: and(eq(resumeAssessment.applicationId, applicationId), eq(resumeAssessment.organizationId, orgId)),
  })

  return { assessment: assessment ?? null }
})
