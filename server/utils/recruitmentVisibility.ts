import { and, eq } from 'drizzle-orm'
import { application, interview, member, recruitmentRequirementState } from '../database/schema'

/**
 * PDS requirement visibility policy.
 * Organization owners/admins can see all requirements.
 * Standard members (recruiters) can see only requirements allocated to them
 * through recruitment_requirement_state.owner_user_id.
 */
export async function getRequirementVisibility(orgId: string, userId: string) {
  const membership = await db.query.member.findFirst({
    where: and(eq(member.organizationId, orgId), eq(member.userId, userId)),
    columns: { role: true },
  })

  const role = membership?.role ?? 'member'
  const canSeeAll = role === 'owner' || role === 'admin'

  return { role, canSeeAll, userId }
}

export async function getVisibleRequirementIds(orgId: string, userId: string) {
  const visibility = await getRequirementVisibility(orgId, userId)
  if (visibility.canSeeAll) return null

  const rows = await db.select({ jobId: recruitmentRequirementState.jobId })
    .from(recruitmentRequirementState)
    .where(and(
      eq(recruitmentRequirementState.organizationId, orgId),
      eq(recruitmentRequirementState.ownerUserId, userId),
    ))

  return rows.map(row => row.jobId)
}

export async function canAccessRequirement(orgId: string, userId: string, jobId: string) {
  const visibility = await getRequirementVisibility(orgId, userId)
  if (visibility.canSeeAll) return true

  const allocation = await db.query.recruitmentRequirementState.findFirst({
    where: and(
      eq(recruitmentRequirementState.organizationId, orgId),
      eq(recruitmentRequirementState.jobId, jobId),
      eq(recruitmentRequirementState.ownerUserId, userId),
    ),
    columns: { id: true },
  })

  return Boolean(allocation)
}

/**
 * Use inside every requirement-specific API after authentication.
 * Returns 404 rather than 403 so recruiters cannot probe the existence of
 * requirements allocated to other recruiters.
 */
export async function assertRequirementAccess(orgId: string, userId: string, jobId: string) {
  const allowed = await canAccessRequirement(orgId, userId, jobId)
  if (!allowed) {
    throw createError({ statusCode: 404, statusMessage: 'Requirement not found' })
  }
}

/**
 * Resolve an application to its requirement and apply the same allocation rule.
 * This protects legacy application routes that do not carry a jobId in the URL.
 */
export async function assertApplicationAccess(orgId: string, userId: string, applicationId: string) {
  const row = await db.query.application.findFirst({
    where: and(eq(application.id, applicationId), eq(application.organizationId, orgId)),
    columns: { id: true, jobId: true },
  })

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Application not found' })
  }

  await assertRequirementAccess(orgId, userId, row.jobId)
  return row
}

/**
 * Resolve a legacy interview to its application and therefore to its allocated
 * requirement. PDS V1 keeps interviews external, but old Reqcore endpoints are
 * retained for compatibility and must not bypass recruiter visibility.
 */
export async function assertInterviewAccess(orgId: string, userId: string, interviewId: string) {
  const row = await db.query.interview.findFirst({
    where: and(eq(interview.id, interviewId), eq(interview.organizationId, orgId)),
    columns: { id: true, applicationId: true },
  })

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Interview not found' })
  }

  await assertApplicationAccess(orgId, userId, row.applicationId)
  return row
}
