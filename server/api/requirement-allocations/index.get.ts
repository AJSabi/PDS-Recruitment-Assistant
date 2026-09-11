import { and, count, eq, sql } from 'drizzle-orm'
import { job, member, recruitmentRequirementState, user } from '../../database/schema'
import { getRequirementVisibility } from '../../utils/recruitmentVisibility'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { job: ['read'] })
  const orgId = session.session.activeOrganizationId
  const visibility = await getRequirementVisibility(orgId, session.user.id)

  if (!visibility.canSeeAll) {
    throw createError({ statusCode: 403, statusMessage: 'Requirement allocation is available only to recruitment administrators.' })
  }

  const [members, requirements, workloadRows] = await Promise.all([
    db.select({
      userId: user.id,
      name: user.name,
      email: user.email,
      role: member.role,
    })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, orgId))
      .orderBy(user.name),

    db.select({
      jobId: job.id,
      title: job.title,
      status: job.status,
      location: job.location,
      ownerUserId: recruitmentRequirementState.ownerUserId,
      assignmentDate: recruitmentRequirementState.assignmentDate,
      targetClosureDate: recruitmentRequirementState.targetClosureDate,
      closedAt: recruitmentRequirementState.closedAt,
      revision: recruitmentRequirementState.revision,
      recruiterName: user.name,
      recruiterEmail: user.email,
    })
      .from(job)
      .leftJoin(recruitmentRequirementState, and(
        eq(recruitmentRequirementState.jobId, job.id),
        eq(recruitmentRequirementState.organizationId, orgId),
      ))
      .leftJoin(user, eq(user.id, recruitmentRequirementState.ownerUserId))
      .where(eq(job.organizationId, orgId))
      .orderBy(sql`${job.status} = 'open' desc`, job.title),

    db.select({
      userId: recruitmentRequirementState.ownerUserId,
      openRequirements: count(),
    })
      .from(recruitmentRequirementState)
      .innerJoin(job, eq(job.id, recruitmentRequirementState.jobId))
      .where(and(
        eq(recruitmentRequirementState.organizationId, orgId),
        eq(job.status, 'open'),
        sql`${recruitmentRequirementState.ownerUserId} is not null`,
      ))
      .groupBy(recruitmentRequirementState.ownerUserId),
  ])

  const workload = Object.fromEntries(workloadRows.map(row => [row.userId, Number(row.openRequirements)]))

  return {
    members: members.map(person => ({ ...person, openRequirements: workload[person.userId] ?? 0 })),
    requirements,
    summary: {
      total: requirements.length,
      open: requirements.filter(r => r.status === 'open').length,
      allocated: requirements.filter(r => Boolean(r.ownerUserId)).length,
      unallocated: requirements.filter(r => r.status === 'open' && !r.ownerUserId).length,
    },
  }
})
