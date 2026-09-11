import { and, eq } from 'drizzle-orm'
import { application, interview, member, recruitmentRequirementState } from '../database/schema'

export async function getRequirementVisibility(orgId: string, userId: string) {
  const membership = await db.query.member.findFirst({
    where: and(eq(member.organizationId, orgId), eq(member.userId, userId)),
    columns: { role: true },
  })
  const role = membership?.role ?? 'member'
  return { role, canSeeAll: role === 'owner' || role === 'admin', userId }
}

export async function assertRecruitmentAdmin(orgId: string, userId: string) {
  const visibility = await getRequirementVisibility(orgId, userId)
  if (!visibility.canSeeAll) {
    throw createError({ statusCode: 403, statusMessage: 'Only recruitment administrators can perform this action.' })
  }
  return visibility
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

export async function assertRequirementAccess(orgId: string, userId: string, jobId: string) {
  if (!(await canAccessRequirement(orgId, userId, jobId))) {
    throw createError({ statusCode: 404, statusMessage: 'Requirement not found' })
  }
}

export async function assertApplicationAccess(orgId: string, userId: string, applicationId: string) {
  const row = await db.query.application.findFirst({
    where: and(eq(application.id, applicationId), eq(application.organizationId, orgId)),
    columns: { id: true, jobId: true, candidateId: true },
  })
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Application not found' })
  await assertRequirementAccess(orgId, userId, row.jobId)
  return row
}

export async function assertInterviewAccess(orgId: string, userId: string, interviewId: string) {
  const row = await db.query.interview.findFirst({
    where: and(eq(interview.id, interviewId), eq(interview.organizationId, orgId)),
    columns: { id: true, applicationId: true },
  })
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Interview not found' })
  await assertApplicationAccess(orgId, userId, row.applicationId)
  return row
}

/** Candidate records are intentionally shared in the central PDS Candidate Database.
 * Job/application comments follow requirement allocation visibility.
 */
export async function assertCommentTargetAccess(
  orgId: string,
  userId: string,
  targetType: 'candidate' | 'application' | 'job',
  targetId: string,
) {
  if (targetType === 'candidate') return
  if (targetType === 'application') return assertApplicationAccess(orgId, userId, targetId)
  return assertRequirementAccess(orgId, userId, targetId)
}
