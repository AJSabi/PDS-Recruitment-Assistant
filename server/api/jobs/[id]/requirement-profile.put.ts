import { and, eq } from 'drizzle-orm'
import { job, recruitmentRequirementState } from '../../../database/schema'
import { ensureRequirementState } from '../../../utils/recruitmentLifecycle'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })
const bodySchema = z.object({
  functionName: z.string().trim().max(300).nullish(),
  hiringManager: z.string().trim().max(300).nullish(),
  experienceRequirement: z.string().trim().max(500).nullish(),
  openings: z.number().int().min(1).max(500).nullish(),
  majorRequirements: z.array(z.string().trim().min(1).max(500)).max(20).optional().default([]),
  assignmentDate: z.string().datetime().nullish(),
  targetClosureDate: z.string().datetime().nullish(),
}).strict()

function addDays(date: Date, days: number) {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { job: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { id: jobId } = await getValidatedRouterParams(event, paramsSchema.parse)
  const body = await readValidatedBody(event, bodySchema.parse)

  const jobRecord = await db.query.job.findFirst({
    where: and(eq(job.id, jobId), eq(job.organizationId, orgId)),
    columns: { id: true },
  })
  if (!jobRecord) throw createError({ statusCode: 404, statusMessage: 'Job not found' })

  const state = await ensureRequirementState(orgId, jobId)
  const assignmentDate = body.assignmentDate ? new Date(body.assignmentDate) : (state.assignmentDate ?? new Date())
  const targetClosureDate = body.targetClosureDate
    ? new Date(body.targetClosureDate)
    : (state.targetClosureDate ?? addDays(assignmentDate, 60))

  const [updated] = await db.update(recruitmentRequirementState).set({
    requirementProfile: {
      functionName: body.functionName || null,
      hiringManager: body.hiringManager || null,
      experienceRequirement: body.experienceRequirement || null,
      openings: body.openings ?? null,
      majorRequirements: body.majorRequirements,
    },
    assignmentDate,
    targetClosureDate,
    updatedAt: new Date(),
  }).where(eq(recruitmentRequirementState.id, state.id)).returning()

  return { state: updated ?? state }
})
