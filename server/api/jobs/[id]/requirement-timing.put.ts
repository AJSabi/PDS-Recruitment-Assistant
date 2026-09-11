import { and, eq } from 'drizzle-orm'
import { job } from '../../../database/schema/app'
import { recruitmentRequirementState } from '../../../database/schema/recruitmentWorkflow'
import { assertRecruitmentAdmin } from '../../../utils/recruitmentVisibility'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })
const bodySchema = z.object({
  assignmentDate: z.string().datetime().nullable(),
  targetClosureDate: z.string().datetime().nullable().optional(),
  closedAt: z.string().datetime().nullable().optional(),
}).strict()

function addDays(date: Date, days: number) {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { job: ['update'] })
  const orgId = session.session.activeOrganizationId
  await assertRecruitmentAdmin(orgId, session.user.id)
  const { id: jobId } = await getValidatedRouterParams(event, paramsSchema.parse)
  const body = await readValidatedBody(event, bodySchema.parse)

  const [requirement, existing] = await Promise.all([
    db.query.job.findFirst({
      where: and(eq(job.id, jobId), eq(job.organizationId, orgId)),
      columns: { id: true },
    }),
    db.query.recruitmentRequirementState.findFirst({
      where: and(eq(recruitmentRequirementState.jobId, jobId), eq(recruitmentRequirementState.organizationId, orgId)),
    }),
  ])
  if (!requirement) throw createError({ statusCode: 404, statusMessage: 'Requirement not found' })

  const assignmentDate = body.assignmentDate ? new Date(body.assignmentDate) : null
  const targetClosureDate = body.targetClosureDate === undefined
    ? (existing?.targetClosureDate ?? (assignmentDate ? addDays(assignmentDate, 60) : null))
    : (body.targetClosureDate ? new Date(body.targetClosureDate) : null)
  const closedAt = body.closedAt === undefined
    ? (existing?.closedAt ?? null)
    : (body.closedAt ? new Date(body.closedAt) : null)
  const now = new Date()

  if (existing) {
    const [updated] = await db.update(recruitmentRequirementState).set({
      assignmentDate,
      targetClosureDate,
      closedAt,
      updatedAt: now,
    }).where(eq(recruitmentRequirementState.id, existing.id)).returning()
    return { state: updated }
  }

  const [created] = await db.insert(recruitmentRequirementState).values({
    organizationId: orgId,
    jobId,
    assignmentDate,
    targetClosureDate,
    closedAt,
  }).returning()

  return { state: created }
})