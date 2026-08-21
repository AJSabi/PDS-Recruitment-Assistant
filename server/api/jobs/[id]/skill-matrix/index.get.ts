import { and, eq } from 'drizzle-orm'
import { job, jobSkillMatrix } from '../../../../database/schema'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { scoring: ['read'] })
  const orgId = session.session.activeOrganizationId
  const { id: jobId } = await getValidatedRouterParams(event, paramsSchema.parse)

  const jobRecord = await db.query.job.findFirst({
    where: and(eq(job.id, jobId), eq(job.organizationId, orgId)),
    columns: { id: true },
  })
  if (!jobRecord) throw createError({ statusCode: 404, statusMessage: 'Job not found' })

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
