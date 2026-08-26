import { eq, and } from 'drizzle-orm'
import { job } from '../../database/schema'
import { idParamSchema } from '../../utils/schemas/job'
import { assertRecruitmentAdmin } from '../../utils/recruitmentVisibility'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { job: ['delete'] })
  const orgId = session.session.activeOrganizationId
  await assertRecruitmentAdmin(orgId, session.user.id)

  const { id } = await getValidatedRouterParams(event, idParamSchema.parse)

  const [deleted] = await db.delete(job)
    .where(and(eq(job.id, id), eq(job.organizationId, orgId)))
    .returning({ id: job.id })

  if (!deleted) throw createError({ statusCode: 404, statusMessage: 'Requirement not found' })

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'deleted',
    resourceType: 'job',
    resourceId: id,
  })

  setResponseStatus(event, 204)
  return null
})
