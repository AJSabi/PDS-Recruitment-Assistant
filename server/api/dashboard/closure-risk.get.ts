import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { job, recruitmentRequirementState } from '../../database/schema'
import { getVisibleRequirementIds } from '../../utils/recruitmentVisibility'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { job: ['read'] })
  const orgId = session.session.activeOrganizationId
  const visibleRequirementIds = await getVisibleRequirementIds(orgId, session.user.id)
  if (visibleRequirementIds && visibleRequirementIds.length === 0) return { data: [] }

  const scope = [
    eq(recruitmentRequirementState.organizationId, orgId),
    sql`${job.status} in ('draft','open')`,
    sql`${recruitmentRequirementState.targetClosureDate} is not null`,
  ]
  if (visibleRequirementIds) scope.push(inArray(recruitmentRequirementState.jobId, visibleRequirementIds))

  const rows = await db.select({
    jobId: job.id,
    title: job.title,
    status: job.status,
    assignmentDate: recruitmentRequirementState.assignmentDate,
    targetClosureDate: recruitmentRequirementState.targetClosureDate,
    ownerUserId: recruitmentRequirementState.ownerUserId,
    openDays: sql<number | null>`case when ${recruitmentRequirementState.assignmentDate} is null then null else greatest(0, (current_date - ${recruitmentRequirementState.assignmentDate}::date)) end`.as('open_days'),
    daysToClosure: sql<number>`(${recruitmentRequirementState.targetClosureDate}::date - current_date)`.as('days_to_closure'),
  })
    .from(recruitmentRequirementState)
    .innerJoin(job, eq(job.id, recruitmentRequirementState.jobId))
    .where(and(...scope))
    .orderBy(asc(recruitmentRequirementState.targetClosureDate))
    .limit(200)

  return { data: rows }
})
