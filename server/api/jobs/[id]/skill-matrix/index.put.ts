import { and, eq } from 'drizzle-orm'
import { job, jobSkillMatrix } from '../../../../database/schema'
import { saveSkillMatrixSchema } from '../../../../utils/schemas/skillMatrix'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { scoring: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { id: jobId } = await getValidatedRouterParams(event, paramsSchema.parse)
  const body = await readValidatedBody(event, saveSkillMatrixSchema.parse)

  const jobRecord = await db.query.job.findFirst({
    where: and(eq(job.id, jobId), eq(job.organizationId, orgId)),
    columns: { id: true },
  })
  if (!jobRecord) throw createError({ statusCode: 404, statusMessage: 'Job not found' })

  const now = new Date()
  const approvedAt = body.approved ? now : null

  const [saved] = await db.insert(jobSkillMatrix).values({
    organizationId: orgId,
    jobId,
    matrix: body.matrix,
    approvedAt,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: jobSkillMatrix.jobId,
    set: {
      matrix: body.matrix,
      approvedAt,
      updatedAt: now,
    },
  }).returning()

  return {
    matrix: saved?.matrix ?? body.matrix,
    approved: Boolean(saved?.approvedAt),
    approvedAt: saved?.approvedAt ?? null,
    updatedAt: saved?.updatedAt ?? now,
  }
})
