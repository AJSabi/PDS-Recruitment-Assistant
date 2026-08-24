import { and, asc, eq } from 'drizzle-orm'
import { application, recruitmentEvidence } from '../../../../database/schema'
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

  const evidence = await db.select().from(recruitmentEvidence)
    .where(and(eq(recruitmentEvidence.applicationId, applicationId), eq(recruitmentEvidence.organizationId, orgId)))
    .orderBy(asc(recruitmentEvidence.createdAt))

  return { evidence }
})
