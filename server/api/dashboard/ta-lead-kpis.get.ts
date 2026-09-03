import { and, eq, gte, inArray } from 'drizzle-orm'
import { recruitmentEvidence, user } from '../../database/schema'
import { assertRecruitmentAdmin } from '../../utils/recruitmentVisibility'

const TIME_ZONE = 'Asia/Kolkata'
const AVERAGE_DAYS = 30

const emptyMetrics = () => ({
  candidatesSourced: 0,
  recruiterScreeningsCompleted: 0,
  interviewsScheduled: 0,
  interviewsCompleted: 0,
  offersRaised: 0,
  offersAccepted: 0,
  offersDeclined: 0,
  joined: 0,
})

type Metrics = ReturnType<typeof emptyMetrics>

type EvidenceRow = {
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

function previousWeekday(date: string) {
  let value = shiftDate(date, -1)
  while ([0, 6].includes(new Date(`${value}T00:00:00Z`).getUTCDay())) value = shiftDate(value, -1)
  return value
}

function addMetric(target: Metrics, row: EvidenceRow) {
  if (row.type === 'sourcing') {
    target.candidatesSourced++
    return
  }
  if (row.type !== 'stage_change') return

  const to = typeof row.payload?.to === 'string' ? row.payload.to : ''
  if (to === 'recruiter_screening_completed') target.recruiterScreeningsCompleted++
  if (['hiring_manager_round_pending', 'hod_round_pending', 'hr_round_pending'].includes(to)) target.interviewsScheduled++
  if (['hiring_manager_round_completed', 'hod_round_completed', 'hr_round_completed'].includes(to)) target.interviewsCompleted++
  if (to === 'offer_stage') target.offersRaised++
  if (to === 'offer_accepted') target.offersAccepted++
  if (to === 'offer_declined') target.offersDeclined++
  if (to === 'joined') target.joined++
}

function dailyAverage(metrics: Metrics) {
  return Object.fromEntries(
    Object.entries(metrics).map(([key, value]) => [key, Number((value / AVERAGE_DAYS).toFixed(1))]),
  ) as Metrics
}

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { job: ['read'], candidate: ['read'], application: ['read'] })
  const orgId = session.session.activeOrganizationId
  const userId = session.user.id
  await assertRecruitmentAdmin(orgId, userId)

  const today = dateInTimeZone()
  const lastWeekdayDate = previousWeekday(today)
  const averageStartDate = shiftDate(lastWeekdayDate, -(AVERAGE_DAYS - 1))
  const queryStart = new Date(`${averageStartDate}T00:00:00+05:30`)

  const rows = await db.select({
    createdBy: recruitmentEvidence.createdBy,
    recruiterName: user.name,
    type: recruitmentEvidence.type,
    payload: recruitmentEvidence.payload,
    createdAt: recruitmentEvidence.createdAt,
  })
    .from(recruitmentEvidence)
    .leftJoin(user, eq(user.id, recruitmentEvidence.createdBy))
    .where(and(
      eq(recruitmentEvidence.organizationId, orgId),
      inArray(recruitmentEvidence.type, ['sourcing', 'stage_change']),
      gte(recruitmentEvidence.createdAt, queryStart),
    ))

  const teamDaily = emptyMetrics()
  const teamWindow = emptyMetrics()
  const recruiterMap = new Map<string, {
    recruiterId: string
    recruiterName: string
    daily: Metrics
    window: Metrics
  }>()

  for (const row of rows as EvidenceRow[]) {
    if (!row.createdBy) continue
    const eventDate = dateInTimeZone(new Date(row.createdAt))
    if (eventDate < averageStartDate || eventDate > lastWeekdayDate) continue

    const recruiter = recruiterMap.get(row.createdBy) ?? {
      recruiterId: row.createdBy,
      recruiterName: row.recruiterName ?? 'Recruiter',
      daily: emptyMetrics(),
      window: emptyMetrics(),
    }

    addMetric(recruiter.window, row)
    addMetric(teamWindow, row)
    if (eventDate === lastWeekdayDate) {
      addMetric(recruiter.daily, row)
      addMetric(teamDaily, row)
    }
    recruiterMap.set(row.createdBy, recruiter)
  }

  const recruiters = [...recruiterMap.values()]
    .map(row => ({
      recruiterId: row.recruiterId,
      recruiterName: row.recruiterName,
      daily: row.daily,
      average: dailyAverage(row.window),
      windowTotals: row.window,
    }))
    .sort((a, b) => a.recruiterName.localeCompare(b.recruiterName))

  return {
    date: lastWeekdayDate,
    averageWindow: {
      days: AVERAGE_DAYS,
      startDate: averageStartDate,
      endDate: lastWeekdayDate,
    },
    team: {
      daily: teamDaily,
      average: dailyAverage(teamWindow),
      windowTotals: teamWindow,
    },
    recruiters,
    attributionNote: 'TA activity metrics use immutable recruiter evidence actors. Historical sourcing before sourcing telemetry was introduced is intentionally not inferred from current assignment.',
    scopeNote: 'This is an operational team view for recruitment administrators and owners. It is descriptive and does not rank recruiters or candidates.',
  }
})
