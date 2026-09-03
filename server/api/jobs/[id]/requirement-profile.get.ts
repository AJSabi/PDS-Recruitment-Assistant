import { and, eq } from 'drizzle-orm'
import { job } from '../../../database/schema'
import { ensureRequirementState } from '../../../utils/recruitmentLifecycle'
import { assertRequirementAccess } from '../../../utils/recruitmentVisibility'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { job: ['read'] })
  const orgId = session.session.activeOrganizationId
  const { id: jobId } = await getValidatedRouterParams(event, paramsSchema.parse)
  await assertRequirementAccess(orgId, session.user.id, jobId)

  const jobRecord = await db.query.job.findFirst({
    where: and(eq(job.id, jobId), eq(job.organizationId, orgId)),
    columns: { id: true, title: true, description: true, location: true, experienceLevel: true },
  })
  if (!jobRecord) throw createError({ statusCode: 404, statusMessage: 'Requirement not found' })

  const state = await ensureRequirementState(orgId, jobId)
  const profile = state.requirementProfile ?? {}

  return {
    jobId,
    profile: {
      jobTitle: jobRecord.title,
      functionName: profile.functionName ?? null,
      hiringManager: profile.hiringManager ?? null,
      location: jobRecord.location ?? null,
      experienceRequirement: profile.experienceRequirement ?? null,
      seniority: jobRecord.experienceLevel ?? null,
      openings: profile.openings ?? null,
      closureDate: state.targetClosureDate ?? null,
      assignmentDate: state.assignmentDate ?? null,
      ownerUserId: state.ownerUserId ?? null,
      allocated: Boolean(state.ownerUserId && state.assignmentDate),
      majorRequirements: profile.majorRequirements ?? [],
      hasActiveJd: Boolean(jobRecord.description?.trim()),
      skillMatrixApproved: Boolean(state.skillMatrixApproved),
    },
  }
})