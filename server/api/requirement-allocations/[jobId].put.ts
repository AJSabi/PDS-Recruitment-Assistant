import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { application, job, member, recruitmentApplicationProfile, recruitmentRequirementState } from '../../database/schema'
import { getRequirementVisibility } from '../../utils/recruitmentVisibility'

const paramsSchema = z.object({ jobId: z.string().min(1) })
const bodySchema = z.object({
  ownerUserId: z.string().min(1).nullable(),
  assignmentDate: z.string().datetime().nullable().optional(),
  targetClosureDate: z.string().datetime().nullable().optional(),
}).strict()

function plusDays(value: Date, days: number) {
  const result = new Date(value)
  result.setDate(result.getDate() + days)
  return result
}

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { job: ['update'] })
  const orgId = session.session.activeOrganizationId
  const visibility = await getRequirementVisibility(orgId, session.user.id)
  if (!visibility.canSeeAll) {
    throw createError({ statusCode: 403, statusMessage: 'Requirement allocation is available only to recruitment administrators.' })
  }

  const { jobId } = await getValidatedRouterParams(event, paramsSchema.parse)
  const body = await readValidatedBody(event, bodySchema.parse)

  const requirement = await db.query.job.findFirst({
    where: and(eq(job.id, jobId), eq(job.organizationId, orgId)),
    columns: { id: true },
  })
  if (!requirement) throw createError({ statusCode: 404, statusMessage: 'Requirement not found' })

  if (body.ownerUserId) {
    const assignee = await db.query.member.findFirst({
      where: and(eq(member.organizationId, orgId), eq(member.userId, body.ownerUserId)),
      columns: { id: true },
    })
    if (!assignee) throw createError({ statusCode: 422, statusMessage: 'Selected recruiter is not a member of this organisation.' })
  }

  const existing = await db.query.recruitmentRequirementState.findFirst({
    where: and(
      eq(recruitmentRequirementState.organizationId, orgId),
      eq(recruitmentRequirementState.jobId, jobId),
    ),
  })

  const now = new Date()
  const assignmentDate = body.ownerUserId
    ? body.assignmentDate ? new Date(body.assignmentDate) : now
    : null

  const targetClosureDate = body.targetClosureDate !== undefined
    ? body.targetClosureDate ? new Date(body.targetClosureDate) : null
    : existing?.targetClosureDate ?? (body.ownerUserId ? plusDays(assignmentDate!, 60) : null)

  const applicationRows = await db.select({ id: application.id })
    .from(application)
    .where(and(eq(application.organizationId, orgId), eq(application.jobId, jobId)))
  const applicationIds = applicationRows.map(row => row.id)

  const state = await db.transaction(async (tx) => {
    let updatedState
    if (existing) {
      ;[updatedState] = await tx.update(recruitmentRequirementState).set({
        ownerUserId: body.ownerUserId,
        assignmentDate,
        targetClosureDate,
        updatedAt: now,
      }).where(eq(recruitmentRequirementState.id, existing.id)).returning()
    } else {
      ;[updatedState] = await tx.insert(recruitmentRequirementState).values({
        organizationId: orgId,
        jobId,
        ownerUserId: body.ownerUserId,
        assignmentDate,
        targetClosureDate,
        updatedAt: now,
      }).returning()
    }

    if (applicationIds.length) {
      await tx.update(recruitmentApplicationProfile).set({
        assignedRecruiterId: body.ownerUserId,
        lastUpdatedBy: session.user.id,
        updatedAt: now,
      }).where(and(
        eq(recruitmentApplicationProfile.organizationId, orgId),
        inArray(recruitmentApplicationProfile.applicationId, applicationIds),
      ))
    }

    return updatedState
  })

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'updated',
    resourceType: 'job',
    resourceId: jobId,
    metadata: {
      action: 'requirement_reallocated',
      previousOwnerUserId: existing?.ownerUserId ?? null,
      ownerUserId: body.ownerUserId,
      cascadedApplications: applicationIds.length,
      assignmentDate,
      targetClosureDate,
    },
  })

  return { state, cascadedApplications: applicationIds.length }
})