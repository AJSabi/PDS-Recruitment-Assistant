import { and, eq, inArray, sql } from 'drizzle-orm'
import { application, recruitmentEvidence } from '../../database/schema'
import { getVisibleRequirementIds } from '../../utils/recruitmentVisibility'

const TIME_ZONE = 'Asia/Kolkata'
const AVERAGE_DAYS = 30

const emptyStageMetrics = {
  recruiterScreeningsCompleted: 0,
  interviewsScheduled: 0,
  interviewsCompleted: 0,
  hiringManagerCompleted: 0,
  hodCompleted: 0,
  hrCompleted: 0,
  offersRaised: 0,
  offersAccepted: 0,
  offersDeclined: 0,
  joined: 0,
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

function numberValue(value: unknown) {
  return Number(value ?? 0)
}

function dailyAverage(value: unknown) {
  return Number((numberValue(value) / AVERAGE_DAYS).toFixed(1))
}

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { job: ['read'], candidate: ['read'], application: ['read'] })
  const orgId = session.session.activeOrganizationId
  const userId = session.user.id
  const visibleRequirementIds = await getVisibleRequirementIds(orgId, userId)

  const today = dateInTimeZone()
  const lastWeekdayDate = previousWeekday(today)
  const averageStartDate = shiftDate(lastWeekdayDate, -(AVERAGE_DAYS - 1))

  if (visibleRequirementIds && visibleRequirementIds.length === 0) {
    return {
      date: lastWeekdayDate,
      averageWindow: { days: AVERAGE_DAYS, startDate: averageStartDate, endDate: lastWeekdayDate },
      daily: { candidatesSourced: 0, ...emptyStageMetrics },
      average: { candidatesSourced: 0, ...emptyStageMetrics },
      attributionNote: 'Recruiter activity is based on immutable recruitment evidence. Historical sourcing before sourcing telemetry was introduced is intentionally not inferred from current assignment.',
    }
  }

  const visibleApplicationCondition = visibleRequirementIds
    ? inArray(application.jobId, visibleRequirementIds)
    : undefined
  const evidenceScope = and(
    eq(recruitmentEvidence.organizationId, orgId),
    eq(recruitmentEvidence.createdBy, userId),
    visibleApplicationCondition,
  )

  const [dailySourcedRows, averageSourcedRows, dailyStageRows, averageStageRows] = await Promise.all([
    db.select({ count: sql<number>`count(*)` })
      .from(recruitmentEvidence)
      .innerJoin(application, eq(application.id, recruitmentEvidence.applicationId))
      .where(and(
        evidenceScope,
        eq(recruitmentEvidence.type, 'sourcing'),
        sql`(${recruitmentEvidence.createdAt} at time zone ${TIME_ZONE})::date = ${lastWeekdayDate}::date`,
      )),

    db.select({ count: sql<number>`count(*)` })
      .from(recruitmentEvidence)
      .innerJoin(application, eq(application.id, recruitmentEvidence.applicationId))
      .where(and(
        evidenceScope,
        eq(recruitmentEvidence.type, 'sourcing'),
        sql`(${recruitmentEvidence.createdAt} at time zone ${TIME_ZONE})::date between ${averageStartDate}::date and ${lastWeekdayDate}::date`,
      )),

    db.select({
      recruiterScreeningsCompleted: sql<number>`count(*) filter (where ${recruitmentEvidence.payload}->>'to' = 'recruiter_screening_completed')`,
      interviewsScheduled: sql<number>`count(*) filter (where ${recruitmentEvidence.payload}->>'to' in ('hiring_manager_round_pending','hod_round_pending','hr_round_pending'))`,
      interviewsCompleted: sql<number>`count(*) filter (where ${recruitmentEvidence.payload}->>'to' in ('hiring_manager_round_completed','hod_round_completed','hr_round_completed'))`,
      hiringManagerCompleted: sql<number>`count(*) filter (where ${recruitmentEvidence.payload}->>'to' = 'hiring_manager_round_completed')`,
      hodCompleted: sql<number>`count(*) filter (where ${recruitmentEvidence.payload}->>'to' = 'hod_round_completed')`,
      hrCompleted: sql<number>`count(*) filter (where ${recruitmentEvidence.payload}->>'to' = 'hr_round_completed')`,
      offersRaised: sql<number>`count(*) filter (where ${recruitmentEvidence.payload}->>'to' = 'offer_stage')`,
      offersAccepted: sql<number>`count(*) filter (where ${recruitmentEvidence.payload}->>'to' = 'offer_accepted')`,
      offersDeclined: sql<number>`count(*) filter (where ${recruitmentEvidence.payload}->>'to' = 'offer_declined')`,
      joined: sql<number>`count(*) filter (where ${recruitmentEvidence.payload}->>'to' = 'joined')`,
    })
      .from(recruitmentEvidence)
      .innerJoin(application, eq(application.id, recruitmentEvidence.applicationId))
      .where(and(
        evidenceScope,
        eq(recruitmentEvidence.type, 'stage_change'),
        sql`(${recruitmentEvidence.createdAt} at time zone ${TIME_ZONE})::date = ${lastWeekdayDate}::date`,
      )),

    db.select({
      recruiterScreeningsCompleted: sql<number>`count(*) filter (where ${recruitmentEvidence.payload}->>'to' = 'recruiter_screening_completed')`,
      interviewsScheduled: sql<number>`count(*) filter (where ${recruitmentEvidence.payload}->>'to' in ('hiring_manager_round_pending','hod_round_pending','hr_round_pending'))`,
      interviewsCompleted: sql<number>`count(*) filter (where ${recruitmentEvidence.payload}->>'to' in ('hiring_manager_round_completed','hod_round_completed','hr_round_completed'))`,
      hiringManagerCompleted: sql<number>`count(*) filter (where ${recruitmentEvidence.payload}->>'to' = 'hiring_manager_round_completed')`,
      hodCompleted: sql<number>`count(*) filter (where ${recruitmentEvidence.payload}->>'to' = 'hod_round_completed')`,
      hrCompleted: sql<number>`count(*) filter (where ${recruitmentEvidence.payload}->>'to' = 'hr_round_completed')`,
      offersRaised: sql<number>`count(*) filter (where ${recruitmentEvidence.payload}->>'to' = 'offer_stage')`,
      offersAccepted: sql<number>`count(*) filter (where ${recruitmentEvidence.payload}->>'to' = 'offer_accepted')`,
      offersDeclined: sql<number>`count(*) filter (where ${recruitmentEvidence.payload}->>'to' = 'offer_declined')`,
      joined: sql<number>`count(*) filter (where ${recruitmentEvidence.payload}->>'to' = 'joined')`,
    })
      .from(recruitmentEvidence)
      .innerJoin(application, eq(application.id, recruitmentEvidence.applicationId))
      .where(and(
        evidenceScope,
        eq(recruitmentEvidence.type, 'stage_change'),
        sql`(${recruitmentEvidence.createdAt} at time zone ${TIME_ZONE})::date between ${averageStartDate}::date and ${lastWeekdayDate}::date`,
      )),
  ])

  const dailyStage = { ...emptyStageMetrics, ...(dailyStageRows[0] ?? {}) }
  const averageStage = { ...emptyStageMetrics, ...(averageStageRows[0] ?? {}) }

  return {
    date: lastWeekdayDate,
    averageWindow: { days: AVERAGE_DAYS, startDate: averageStartDate, endDate: lastWeekdayDate },
    daily: {
      candidatesSourced: numberValue(dailySourcedRows[0]?.count),
      recruiterScreeningsCompleted: numberValue(dailyStage.recruiterScreeningsCompleted),
      interviewsScheduled: numberValue(dailyStage.interviewsScheduled),
      interviewsCompleted: numberValue(dailyStage.interviewsCompleted),
      hiringManagerCompleted: numberValue(dailyStage.hiringManagerCompleted),
      hodCompleted: numberValue(dailyStage.hodCompleted),
      hrCompleted: numberValue(dailyStage.hrCompleted),
      offersRaised: numberValue(dailyStage.offersRaised),
      offersAccepted: numberValue(dailyStage.offersAccepted),
      offersDeclined: numberValue(dailyStage.offersDeclined),
      joined: numberValue(dailyStage.joined),
    },
    average: {
      candidatesSourced: dailyAverage(averageSourcedRows[0]?.count),
      recruiterScreeningsCompleted: dailyAverage(averageStage.recruiterScreeningsCompleted),
      interviewsScheduled: dailyAverage(averageStage.interviewsScheduled),
      interviewsCompleted: dailyAverage(averageStage.interviewsCompleted),
      hiringManagerCompleted: dailyAverage(averageStage.hiringManagerCompleted),
      hodCompleted: dailyAverage(averageStage.hodCompleted),
      hrCompleted: dailyAverage(averageStage.hrCompleted),
      offersRaised: dailyAverage(averageStage.offersRaised),
      offersAccepted: dailyAverage(averageStage.offersAccepted),
      offersDeclined: dailyAverage(averageStage.offersDeclined),
      joined: dailyAverage(averageStage.joined),
    },
    attributionNote: 'Recruiter activity is based on immutable recruitment evidence. Historical sourcing before sourcing telemetry was introduced is intentionally not inferred from current assignment.',
  }
})