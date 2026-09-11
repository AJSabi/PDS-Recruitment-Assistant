import { and, eq, inArray } from 'drizzle-orm'
import { application, job, member, recruitmentApplicationProfile, recruitmentRequirementState } from '../../../database/schema'
import { assertRecruitmentAdmin } from '../../../utils/recruitmentVisibility'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })
const bodySchema = z.object({ ownerUserId: z.string().min(1).nullable() }).strict()

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { job: ['update'] })
  const orgId = session.session.activeOrganizationId
  await assertRecruitmentAdmin(orgId, session.user.id)
  const { id: jobId } = await getValidatedRouterParams(event, paramsSchema.parse)
  const body = await readValidatedBody(event, bodySchema.parse)

  const requirement = await db.query.job.findFirst({
    where: and(eq(job.id, jobId), eq(job.organizationId, orgId)),
    columns: { id: true },
  })
  if (!requirement) throw createError({ statusCode: 404, statusMessage: 'Requirement not found' })

  if (body.ownerUserId) {
    const orgMember = await db.query.member.findFirst({
      where: and(eq(member.organizationId, orgId), eq(member.userId, body.ownerUserId)),
      columns: { id: true },
    })
    if (!orgMember) throw createError({ statusCode: 422, statusMessage: 'Selected owner is not a member of this organization.' })
  }

  const existing = await db.query.recruitmentRequirementState.findFirst({
    where: and(eq(recruitmentRequirementState.organizationId, orgId), eq(recruitmentRequirementState.jobId, jobId)),
  })

  const applicationRows = await db.select({ id: application.id })
    .from(application)
    .where(and(eq(application.organizationId, orgId), eq(application.jobId, jobId)))
  const applicationIds = applicationRows.map(row => row.id)
  const now = new Date()
  const assignmentDate = body.ownerUserId
    ? (existing?.ownerUserId === body.ownerUserId && existing.assignmentDate ? existing.assignmentDate : now)
    : null

  const state = await db.transaction(async (tx) => {
    const [updatedState] = existing
      ? await tx.update(recruitmentRequirementState).set({
          ownerUserId: body.ownerUserId,
          assignmentDate,
          updatedAt: now,
        }).where(eq(recruitmentRequirementState.id, existing.id)).returning()
      : await tx.insert(recruitmentRequirementState).values({
          organizationId: orgId,
          jobId,
          ownerUserId: body.ownerUserId,
          assignmentDate,
          updatedAt: now,
        }).returning()

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
      action: 'legacy_requirement_owner_reallocated',
      previousOwnerUserId: existing?.ownerUserId ?? null,
      ownerUserId: body.ownerUserId,
      cascadedApplications: applicationIds.length,
    },
  })

  return { state, cascadedApplications: applicationIds.length }
})