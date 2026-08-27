import { and, eq } from 'drizzle-orm'
import { job, recruitmentRequirementState } from '../../../database/schema'
import { ensureRequirementState } from '../../../utils/recruitmentLifecycle'
import { getRequirementVisibility, assertRequirementAccess } from '../../../utils/recruitmentVisibility'
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

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { job: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { id: jobId } = await getValidatedRouterParams(event, paramsSchema.parse)
  await assertRequirementAccess(orgId, session.user.id, jobId)
  const body = await readValidatedBody(event, bodySchema.parse)

  const jobRecord = await db.query.job.findFirst({
    where: and(eq(job.id, jobId), eq(job.organizationId, orgId)),
    columns: { id: true },
  })
  if (!jobRecord) throw createError({ statusCode: 404, statusMessage: 'Requirement not found' })

  const state = await ensureRequirementState(orgId, jobId)
  const visibility = await getRequirementVisibility(orgId, session.user.id)
  const assignmentDate = visibility.canSeeAll
    ? (body.assignmentDate === undefined ? state.assignmentDate : body.assignmentDate ? new Date(body.assignmentDate) : null)
    : state.assignmentDate
  const targetClosureDate = visibility.canSeeAll
    ? (body.targetClosureDate === undefined ? state.targetClosureDate : body.targetClosureDate ? new Date(body.targetClosureDate) : null)
    : state.targetClosureDate

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