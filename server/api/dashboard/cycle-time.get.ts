import { and, eq, gte, inArray } from 'drizzle-orm'
import { application, job, recruitmentEvidence, recruitmentRequirementState } from '../../database/schema'
import { getVisibleRequirementIds } from '../../utils/recruitmentVisibility'

type CycleMetric = 'allocation_to_offer' | 'allocation_to_closure'
type StageEventPayload = { event?: unknown; to?: unknown }

function startDateForPeriod(period: number) {
  const value = new Date()
  value.setHours(0, 0, 0, 0)
  value.setDate(value.getDate() - (period - 1))
  return value
}

function daysBetween(from: Date | string, to: Date | string) {
  const start = new Date(from)
  const end = new Date(to)
  start.setHours(0, 0, 0, 0)
  end.setHours(0, 0, 0, 0)
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000))
}

function average(values: number[]) {
  return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)) : null
}

function median(values: number[]) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[middle]
    : Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(1))
}

function buckets(values: number[]) {
  const result = { days0to15: 0, days16to30: 0, days31to45: 0, days46to60: 0, days61plus: 0 }
  for (const value of values) {
    if (value <= 15) result.days0to15++
    else if (value <= 30) result.days16to30++
    else if (value <= 45) result.days31to45++
    else if (value <= 60) result.days46to60++
    else result.days61plus++
  }
  return result
}

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { job: ['read'], candidate: ['read'], application: ['read'] })
  const orgId = session.session.activeOrganizationId
  const userId = session.user.id
  const query = getQuery(event)
  const metric: CycleMetric = query.metric === 'allocation_to_closure' ? 'allocation_to_closure' : 'allocation_to_offer'
  const requestedPeriod = Number(query.period ?? 90)
  const period = [30, 90, 365].includes(requestedPeriod) ? requestedPeriod : 90
  const startDate = startDateForPeriod(period)
  const visibleRequirementIds = await getVisibleRequirementIds(orgId, userId)

  if (visibleRequirementIds && visibleRequirementIds.length === 0) {
    return {
      metric,
      period,
      label: metric === 'allocation_to_offer' ? 'Allocation → Offer' : 'Allocation → Closure',
      averageDays: null,
      medianDays: null,
      samples: 0,
      buckets: buckets([]),
      note: 'No completed cycle-time samples are available in your visible recruitment scope.',
    }
  }

  const requirementRows = await db.select({
    jobId: recruitmentRequirementState.jobId,
    assignmentDate: recruitmentRequirementState.assignmentDate,
    closedAt: recruitmentRequirementState.closedAt,
  })
    .from(recruitmentRequirementState)
    .innerJoin(job, eq(job.id, recruitmentRequirementState.jobId))
    .where(and(
      eq(recruitmentRequirementState.organizationId, orgId),
      eq(job.organizationId, orgId),
      visibleRequirementIds ? inArray(recruitmentRequirementState.jobId, visibleRequirementIds) : undefined,
    ))

  const assignmentByJob = new Map(
    requirementRows
      .filter(row => row.assignmentDate)
      .map(row => [row.jobId, row.assignmentDate!]),
  )

  let values: number[] = []
  let note = ''

  if (metric === 'allocation_to_closure') {
    values = requirementRows
      .filter(row => row.assignmentDate && row.closedAt && new Date(row.closedAt) >= startDate)
      .map(row => daysBetween(row.assignmentDate!, row.closedAt!))
    note = 'Allocation → Closure uses the requirement allocation date and the governed requirement closedAt timestamp. Unallocated or open requirements are excluded.'
  } else {
    const stageRows = await db.select({
      applicationId: recruitmentEvidence.applicationId,
      jobId: application.jobId,
      payload: recruitmentEvidence.payload,
      createdAt: recruitmentEvidence.createdAt,
    })
      .from(recruitmentEvidence)
      .innerJoin(application, eq(application.id, recruitmentEvidence.applicationId))
      .where(and(
        eq(recruitmentEvidence.organizationId, orgId),
        eq(application.organizationId, orgId),
        eq(recruitmentEvidence.type, 'stage_change'),
        gte(recruitmentEvidence.createdAt, startDate),
        visibleRequirementIds ? inArray(application.jobId, visibleRequirementIds) : undefined,
      ))

    const firstOfferByApplication = new Map<string, { jobId: string; at: Date }>()
    for (const row of stageRows) {
      const payload = (row.payload ?? {}) as StageEventPayload
      if (payload.event !== 'stage_changed' && payload.event !== 'stage_confirmed') continue
      if (payload.to !== 'offer_stage') continue
      const existing = firstOfferByApplication.get(row.applicationId)
      const at = new Date(row.createdAt)
      if (!existing || at < existing.at) firstOfferByApplication.set(row.applicationId, { jobId: row.jobId, at })
    }

    values = [...firstOfferByApplication.values()]
      .map((row) => {
        const assignmentDate = assignmentByJob.get(row.jobId)
        return assignmentDate ? daysBetween(assignmentDate, row.at) : null
      })
      .filter((value): value is number => value != null)
    note = 'Allocation → Offer uses the requirement allocation date and the first governed stage event that reaches offer_stage for each application. Applications without an allocation date or offer event are excluded.'
  }

  return {
    metric,
    period,
    label: metric === 'allocation_to_offer' ? 'Allocation → Offer' : 'Allocation → Closure',
    averageDays: average(values),
    medianDays: median(values),
    samples: values.length,
    buckets: buckets(values),
    note,
  }
})
