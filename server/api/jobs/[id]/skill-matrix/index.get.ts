import { and, eq } from 'drizzle-orm'
import { job, jobSkillMatrix } from '../../../../database/schema'
import { assertRequirementAccess } from '../../../../utils/recruitmentVisibility'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { scoring: ['read'] })
  const orgId = session.session.activeOrganizationId
  const { id: jobId } = await getValidatedRouterParams(event, paramsSchema.parse)
  await assertRequirementAccess(orgId, session.user.id, jobId)

  const jobRecord = await db.query.job.findFirst({
    where: and(eq(job.id, jobId), eq(job.organizationId, orgId)),
    columns: { id: true },
  })
  if (!jobRecord) throw createError({ statusCode: 404, statusMessage: 'Requirement not found' })

  const [record] = await db.select().from(jobSkillMatrix).where(and(
    eq(jobSkillMatrix.jobId, jobId),
    eq(jobSkillMatrix.organizationId, orgId),
  )).limit(1)

  return {
    matrix: record?.matrix ?? null,
    approved: Boolean(record?.approvedAt),
    approvedAt: record?.approvedAt ?? null,
    updatedAt: record?.updatedAt ?? null,
  }
})
