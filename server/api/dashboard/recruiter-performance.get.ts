import { and, asc, eq, gte, inArray } from 'drizzle-orm'
import { application, recruitmentEvidence, recruitmentRequirementState, user } from '../../database/schema'
import { getRequirementVisibility, getVisibleRequirementIds } from '../../utils/recruitmentVisibility'

const TIME_ZONE = 'Asia/Kolkata'
const ALLOWED_PERIODS = new Set([7, 30, 90])

const emptyMetrics = () => ({
  candidatesSourced: 0,
  recruiterScreeningsCompleted: 0,
  interviewsCompleted: 0,
  offersRaised: 0,
  offersAccepted: 0,
  joined: 0,
})

type Metrics = ReturnType<typeof emptyMetrics>
type MetricKey = keyof Metrics

type EvidenceRow = {
  applicationId: string
  createdBy: string | null
  recruiterName: string | null
  type: string
  payload: Record<string, unknown> | null
  createdAt: Date
}

function dateInTimeZone(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const year = parts.find(part => part.type === 'year')?.value
  const month = parts.find(part => part.type === 'month')?.value
  const day = parts.find(part => part.type === 'day')?.value
  return `${year}-${month}-${day}`
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function metricKey(row: EvidenceRow): MetricKey | null {
  if (row.type === 'sourcing') return 'candidatesSourced'
  if (row.type !== 'stage_change') return null

  const to = typeof row.payload?.to === 'string' ? row.payload.to : ''
  if (to === 'recruiter_screening_completed') return 'recruiterScreeningsCompleted'
  if (to === 'hiring_manager_round_completed') return 'interviewsCompleted'
  if (to === 'offer_stage') return 'offersRaised'
  if (to === 'offer_accepted') return 'offersAccepted'
  if (to === 'joined') return 'joined'
  return null
}

function conversion(numerator: number, denominator: number) {
  if (!denominator) return null
  return Number(((numerator / denominator) * 100).toFixed(1))
}

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { job: ['read'], candidate: ['read'], application: ['read'] })
  const orgId = session.session.activeOrganizationId
  const userId = session.user.id
  const query = getQuery(event)
  const requestedPeriod = Number(query.period ?? 30)
  const period = ALLOWED_PERIODS.has(requestedPeriod) ? requestedPeriod : 30

  const [visibility, visibleRequirementIds] = await Promise.all([
    getRequirementVisibility(orgId, userId),
    getVisibleRequirementIds(orgId, userId),
  ])

  const requestedRecruiterId = typeof query.recruiterId === 'string' && query.recruiterId.trim()
    ? query.recruiterId.trim()
    : null

  // Recruiters can only inspect their own performance. Owners/admins may select a
  // recruiter from the authorized selector or retain the default team aggregate.
  const actorId = visibility.canSeeAll ? requestedRecruiterId : userId
  const endDate = dateInTimeZone()
  const startDate = shiftDate(endDate, -(period - 1))
  const queryStart = new Date(`${startDate}T00:00:00+05:30`)

  if (visibleRequirementIds && visibleRequirementIds.length === 0) {
    return {
      scope: { role: visibility.role, mode: 'self', recruiterId: userId },
      period: { days: period, startDate, endDate },
      totals: emptyMetrics(),
      conversions: { screeningToInterview: null, interviewToOffer: null, offerToAcceptance: null, offerToJoin: null },
      series: [],
      recruiters: [],
      attributionNote: 'Performance is based on immutable recruitment evidence within the current user’s authorized requirement scope.',
    }
  }

  const conditions = [
    eq(recruitmentEvidence.organizationId, orgId),
    inArray(recruitmentEvidence.type, ['sourcing', 'stage_change']),
    gte(recruitmentEvidence.createdAt, queryStart),
  ]
  if (!visibility.canSeeAll) conditions.push(eq(recruitmentEvidence.createdBy, userId))
  if (visibleRequirementIds) conditions.push(inArray(application.jobId, visibleRequirementIds))

  const [rows, allocatedRecruiterRows] = await Promise.all([
    db.select({
      applicationId: recruitmentEvidence.applicationId,
      createdBy: recruitmentEvidence.createdBy,
      recruiterName: user.name,
      type: recruitmentEvidence.type,
      payload: recruitmentEvidence.payload,
      createdAt: recruitmentEvidence.createdAt,
    })
      .from(recruitmentEvidence)
      .innerJoin(application, eq(application.id, recruitmentEvidence.applicationId))
      .leftJoin(user, eq(user.id, recruitmentEvidence.createdBy))
      .where(and(...conditions))
      .orderBy(asc(recruitmentEvidence.createdAt)),
    visibility.canSeeAll
      ? db.select({
          recruiterId: recruitmentRequirementState.ownerUserId,
          recruiterName: user.name,
        })
          .from(recruitmentRequirementState)
          .leftJoin(user, eq(user.id, recruitmentRequirementState.ownerUserId))
          .where(eq(recruitmentRequirementState.organizationId, orgId))
      : Promise.resolve([]),
  ])

  const totals = emptyMetrics()
  const dayMap = new Map<string, Metrics>()
  const recruiterMap = new Map<string, string>()
  const seenMetricApplications = new Set<string>()

  for (const row of allocatedRecruiterRows) {
    if (row.recruiterId) recruiterMap.set(row.recruiterId, row.recruiterName ?? 'Recruiter')
  }

  for (const row of rows as EvidenceRow[]) {
    if (visibility.canSeeAll && row.createdBy) recruiterMap.set(row.createdBy, row.recruiterName ?? 'Recruiter')
  }

  if (visibility.canSeeAll && requestedRecruiterId && !recruiterMap.has(requestedRecruiterId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid recruiter selection' })
  }

  const metricRows = visibility.canSeeAll && requestedRecruiterId
    ? (rows as EvidenceRow[]).filter(row => row.createdBy === requestedRecruiterId)
    : rows as EvidenceRow[]

  for (const row of metricRows) {
    const eventDate = dateInTimeZone(new Date(row.createdAt))
    if (eventDate < startDate || eventDate > endDate) continue

    const key = metricKey(row)
    if (!key) continue
    const uniqueMetricApplication = `${key}:${row.applicationId}`
    if (seenMetricApplications.has(uniqueMetricApplication)) continue
    seenMetricApplications.add(uniqueMetricApplication)

    totals[key]++
    const daily = dayMap.get(eventDate) ?? emptyMetrics()
    daily[key]++
    dayMap.set(eventDate, daily)
  }

  const series = Array.from({ length: period }, (_, index) => {
    const date = shiftDate(startDate, index)
    return { date, ...(dayMap.get(date) ?? emptyMetrics()) }
  })

  const recruiters = visibility.canSeeAll
    ? [...recruiterMap.entries()]
        .map(([recruiterId, recruiterName]) => ({ recruiterId, recruiterName }))
        .sort((a, b) => a.recruiterName.localeCompare(b.recruiterName))
    : []

  return {
    scope: {
      role: visibility.role,
      mode: visibility.canSeeAll ? (actorId ? 'recruiter' : 'team') : 'self',
      recruiterId: actorId ?? null,
    },
    period: { days: period, startDate, endDate },
    totals,
    conversions: {
      screeningToInterview: conversion(totals.interviewsCompleted, totals.recruiterScreeningsCompleted),
      interviewToOffer: conversion(totals.offersRaised, totals.interviewsCompleted),
      offerToAcceptance: conversion(totals.offersAccepted, totals.offersRaised),
      offerToJoin: conversion(totals.joined, totals.offersRaised),
    },
    series,
    recruiters,
    attributionNote: 'Recruiter performance uses immutable sourcing and stage-change evidence and counts each application once per milestone within the selected period. The same candidate aligned to different requirements remains separate through distinct application records. Interviewed counts candidates reaching the first completed interview round (Hiring Manager), not every downstream interview round. Recruiters see only their own authorized scope; owners/admins may view the team or select one recruiter. The recruiter selector includes requirement owners even when they have no evidence in the selected period. The endpoint is descriptive and does not rank recruiters or candidates.',
  }
})
