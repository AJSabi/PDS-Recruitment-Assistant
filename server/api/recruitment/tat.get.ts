import { and, eq } from 'drizzle-orm'
import { application, job } from '../../database/schema/app'
import { user } from '../../database/schema/auth'
import { recruitmentApplicationProfile, recruitmentRequirementState } from '../../database/schema/recruitmentWorkflow'

const DAY_MS = 86_400_000

function daysBetween(start: Date, end: Date) {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / DAY_MS))
}

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['read'] })
  const orgId = session.session.activeOrganizationId
  const now = new Date()

  const [jobs, states, apps] = await Promise.all([
    db.query.job.findMany({
      where: eq(job.organizationId, orgId),
      columns: { id: true, title: true, status: true, location: true, createdAt: true },
    }),
    db.select({
      jobId: recruitmentRequirementState.jobId,
      ownerUserId: recruitmentRequirementState.ownerUserId,
      ownerName: user.name,
      assignmentDate: recruitmentRequirementState.assignmentDate,
      targetClosureDate: recruitmentRequirementState.targetClosureDate,
      closedAt: recruitmentRequirementState.closedAt,
    }).from(recruitmentRequirementState)
      .leftJoin(user, eq(user.id, recruitmentRequirementState.ownerUserId))
      .where(eq(recruitmentRequirementState.organizationId, orgId)),
    db.select({
      jobId: application.jobId,
      status: recruitmentApplicationProfile.lastStatus,
    }).from(application)
      .leftJoin(recruitmentApplicationProfile, and(
        eq(recruitmentApplicationProfile.applicationId, application.id),
        eq(recruitmentApplicationProfile.organizationId, orgId),
      ))
      .where(eq(application.organizationId, orgId)),
  ])

  const stateMap = new Map(states.map(row => [row.jobId, row]))
  const rows = jobs.map((requirement) => {
    const state = stateMap.get(requirement.id)
    const assignmentDate = state?.assignmentDate ?? requirement.createdAt
    const targetClosureDate = state?.targetClosureDate ?? new Date(assignmentDate.getTime() + 60 * DAY_MS)
    const closedAt = state?.closedAt ?? null
    const effectiveEnd = closedAt ?? now
    const daysOpen = daysBetween(assignmentDate, effectiveEnd)
    const daysToTarget = Math.ceil((targetClosureDate.getTime() - now.getTime()) / DAY_MS)
    const isClosed = Boolean(closedAt) || requirement.status === 'closed'
    const overdue = !isClosed && daysToTarget < 0
    const approaching = !isClosed && daysToTarget >= 0 && daysToTarget <= 10
    const candidateRows = apps.filter(row => row.jobId === requirement.id)
    const activeCandidates = candidateRows.filter(row => !['closed', 'joined', 'not_proceeding'].includes(row.status ?? 'candidate_added')).length

    return {
      jobId: requirement.id,
      title: requirement.title,
      location: requirement.location,
      jobStatus: requirement.status,
      ownerUserId: state?.ownerUserId ?? null,
      ownerName: state?.ownerName ?? null,
      assignmentDate,
      targetClosureDate,
      closedAt,
      daysOpen,
      daysToTarget,
      overdue,
      approaching,
      isClosed,
      activeCandidates,
    }
  }).sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
    if (a.approaching !== b.approaching) return a.approaching ? -1 : 1
    return a.daysToTarget - b.daysToTarget
  })

  const ownerMap = new Map<string, { ownerUserId: string; ownerName: string; requirements: number; open: number; overdue: number; approaching: number; avgDaysOpenTotal: number }>()
  for (const row of rows) {
    const key = row.ownerUserId ?? 'unassigned'
    const existing = ownerMap.get(key) ?? {
      ownerUserId: row.ownerUserId ?? '',
      ownerName: row.ownerName ?? 'Unassigned',
      requirements: 0,
      open: 0,
      overdue: 0,
      approaching: 0,
      avgDaysOpenTotal: 0,
    }
    existing.requirements += 1
    if (!row.isClosed) existing.open += 1
    if (row.overdue) existing.overdue += 1
    if (row.approaching) existing.approaching += 1
    existing.avgDaysOpenTotal += row.daysOpen
    ownerMap.set(key, existing)
  }

  const owners = Array.from(ownerMap.values()).map(row => ({
    ownerUserId: row.ownerUserId || null,
    ownerName: row.ownerName,
    requirements: row.requirements,
    open: row.open,
    overdue: row.overdue,
    approaching: row.approaching,
    averageDaysOpen: row.requirements ? Math.round(row.avgDaysOpenTotal / row.requirements) : 0,
  })).sort((a, b) => b.overdue - a.overdue || b.open - a.open || a.ownerName.localeCompare(b.ownerName))

  return {
    targetDays: 60,
    summary: {
      requirements: rows.length,
      open: rows.filter(row => !row.isClosed).length,
      approaching: rows.filter(row => row.approaching).length,
      overdue: rows.filter(row => row.overdue).length,
      withinTarget: rows.filter(row => !row.isClosed && !row.overdue).length,
    },
    rows,
    owners,
  }
})
