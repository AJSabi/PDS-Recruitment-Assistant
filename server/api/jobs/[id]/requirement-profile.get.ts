import { and, eq } from 'drizzle-orm'
import { job } from '../../../database/schema'
import { ensureRequirementState } from '../../../utils/recruitmentLifecycle'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { job: ['read'] })
  const orgId = session.session.activeOrganizationId
  const { id: jobId } = await getValidatedRouterParams(event, paramsSchema.parse)

  const jobRecord = await db.query.job.findFirst({
    where: and(eq(job.id, jobId), eq(job.organizationId, orgId)),
    columns: { id: true, title: true, location: true, experienceLevel: true },
  })
  if (!jobRecord) throw createError({ statusCode: 404, statusMessage: 'Job not found' })

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
      majorRequirements: profile.majorRequirements ?? [],
    },
  }
})
