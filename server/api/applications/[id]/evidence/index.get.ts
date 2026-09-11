import { and, asc, eq } from 'drizzle-orm'
import { recruitmentEvidence } from '../../../../database/schema'
import { assertApplicationAccess } from '../../../../utils/recruitmentVisibility'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['read'] })
  const orgId = session.session.activeOrganizationId
  const { id: applicationId } = await getValidatedRouterParams(event, paramsSchema.parse)
  await assertApplicationAccess(orgId, session.user.id, applicationId)

  const evidence = await db.select().from(recruitmentEvidence)
    .where(and(eq(recruitmentEvidence.applicationId, applicationId), eq(recruitmentEvidence.organizationId, orgId)))
    .orderBy(asc(recruitmentEvidence.createdAt))

  return { evidence }
})
