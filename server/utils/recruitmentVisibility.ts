import { and, eq } from 'drizzle-orm'
import { member, recruitmentRequirementState } from '../database/schema'

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

  return {
    role,
    canSeeAll,
    userId,
  }
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
