import { and, eq, gte, inArray } from 'drizzle-orm'
import {
  application,
  applicationSource,
  job,
  recruitmentApplicationProfile,
  recruitmentEvidence,
  recruitmentRequirementState,
  recruiterScreeningSession,
  user,
} from '../../database/schema'
import { recruitmentSourceFromPersistence, recruitmentSourceLabel } from '../../utils/recruitmentSource'
import { assertRecruitmentAdmin } from '../../utils/recruitmentVisibility'

const ACTIVE_REQUIREMENT_STATUSES = ['draft', 'open'] as const
const TERMINAL_STAGES = ['closed', 'joined', 'not_proceeding'] as const
const HISTORICAL_TELEMETRY_START = new Date('2026-09-01T05:28:41.000Z')
const SOURCE_EFFECTIVENESS_START = new Date('2026-09-01T05:55:20.000Z')

type StageEventPayload = {
  event?: unknown
  from?: unknown
  to?: unknown
  source?: unknown
}

function startOfToday() {
  const value = new Date()
  value.setHours(0, 0, 0, 0)
  return value
}

function daysBetween(from: Date | string | null, to = startOfToday()) {
  if (!from) return null
  const start = new Date(from)
  start.setHours(0, 0, 0, 0)
  return Math.max(0, Math.floor((to.getTime() - start.getTime()) / 86400000))
}

function stageGroup(stage?: string | null) {
  if (!stage || ['candidate_added', 'resume_received', 'resume_reviewed'].includes(stage)) return 'candidate_intake'
  if (['recruiter_screening_pending', 'recruiter_screening_completed', 'reassess', 'hold_for_comparison'].includes(stage)) return 'recruiter_screening'
  if (stage.startsWith('hiring_manager_')) return 'hiring_manager'
  if (stage.startsWith('hod_')) return 'hod'
  if (stage.startsWith('hr_')) return 'hr'
  if (['offer_stage', 'offer_accepted', 'offer_declined'].includes(stage)) return 'offer'
  if (stage === 'joined') return 'joined'
  return 'closed_or_not_proceeding'
}

function percentage(numerator: number, denominator: number) {
  return denominator ? Math.round((numerator / denominator) * 1000) / 10 : null
}

function buildHistoricalConversions(rows: Array<{ applicationId: string; payload: Record<string, unknown> | null }>) {
  const reached = new Map<string, Set<string>>()
  const stages = [
    'hiring_manager_round_pending',
    'offer_stage',
    'offer_accepted',
    'joined',
  ] as const
  for (const stage of stages) reached.set(stage, new Set())

  for (const row of rows) {
    const payload = (row.payload ?? {}) as StageEventPayload
    if (payload.event !== 'stage_changed' && payload.event !== 'stage_confirmed') continue
    if (typeof payload.to !== 'string') continue
    reached.get(payload.to)?.add(row.applicationId)
  }

  const hmApplications = reached.get('hiring_manager_round_pending') ?? new Set<string>()
  const offerApplications = reached.get('offer_stage') ?? new Set<string>()
  const acceptedApplications = reached.get('offer_accepted') ?? new Set<string>()
  const joinedApplications = reached.get('joined') ?? new Set<string>()

  const offerFromHm = [...hmApplications].filter(id => offerApplications.has(id)).length
  const acceptedFromOffer = [...offerApplications].filter(id => acceptedApplications.has(id)).length
  const joinedFromAccepted = [...acceptedApplications].filter(id => joinedApplications.has(id)).length

  return {
    telemetryStartAt: HISTORICAL_TELEMETRY_START.toISOString(),
    observedApplications: new Set(rows.map(row => row.applicationId)).size,
    metrics: [
      {
        key: 'interviewToOffer',
        label: 'Interview to Offer',
        numerator: offerFromHm,
        denominator: hmApplications.size,
        rate: percentage(offerFromHm, hmApplications.size),
        numeratorLabel: 'Reached Offer',
        denominatorLabel: 'Reached Hiring Manager',
      },
      {
        key: 'offerToAcceptance',
        label: 'Offer to Acceptance',
        numerator: acceptedFromOffer,
        denominator: offerApplications.size,
        rate: percentage(acceptedFromOffer, offerApplications.size),
        numeratorLabel: 'Offer Accepted',
        denominatorLabel: 'Reached Offer',
      },
      {
        key: 'joiningConversion',
        label: 'Joining Conversion',
        numerator: joinedFromAccepted,
        denominator: acceptedApplications.size,
        rate: percentage(joinedFromAccepted, acceptedApplications.size),
        numeratorLabel: 'Joined',
        denominatorLabel: 'Offer Accepted',
      },
    ],
  }
}

function buildSourceEffectiveness(
  sourceRows: Array<{ applicationId: string; channel: string; utmSource: string | null }>,
  stageRows: Array<{ applicationId: string; payload: Record<string, unknown> | null }>,
) {
  const sourceByApplication = new Map<string, ReturnType<typeof recruitmentSourceFromPersistence>>()
  for (const row of sourceRows) sourceByApplication.set(row.applicationId, recruitmentSourceFromPersistence(row.channel, row.utmSource))

  const reachedByStage = new Map<string, Set<string>>()
  for (const stage of ['recruiter_screening_completed', 'hiring_manager_round_pending', 'offer_stage', 'joined']) reachedByStage.set(stage, new Set())
  for (const row of stageRows) {
    if (!sourceByApplication.has(row.applicationId)) continue
    const payload = (row.payload ?? {}) as StageEventPayload
    if (payload.event !== 'stage_changed' && payload.event !== 'stage_confirmed') continue
    if (typeof payload.to !== 'string') continue
    reachedByStage.get(payload.to)?.add(row.applicationId)
  }

  const grouped = new Map<string, {
    key: string
    label: string
    profiles: Set<string>
    screened: Set<string>
    interviews: Set<string>
    offers: Set<string>
    joined: Set<string>
  }>()

  for (const [applicationId, source] of sourceByApplication.entries()) {
    const group = grouped.get(source) ?? {
      key: source,
      label: recruitmentSourceLabel(source),
      profiles: new Set<string>(),
      screened: new Set<string>(),
      interviews: new Set<string>(),
      offers: new Set<string>(),
      joined: new Set<string>(),
    }
    group.profiles.add(applicationId)
    if (reachedByStage.get('recruiter_screening_completed')?.has(applicationId)) group.screened.add(applicationId)
    if (reachedByStage.get('hiring_manager_round_pending')?.has(applicationId)) group.interviews.add(applicationId)
    if (reachedByStage.get('offer_stage')?.has(applicationId)) group.offers.add(applicationId)
    if (reachedByStage.get('joined')?.has(applicationId)) group.joined.add(applicationId)
    grouped.set(source, group)
  }

  return {
    telemetryStartAt: SOURCE_EFFECTIVENESS_START.toISOString(),
    attributedApplications: sourceByApplication.size,
    rows: [...grouped.values()]
      .map(group => ({
        key: group.key,
        label: group.label,
        profiles: group.profiles.size,
        screened: group.screened.size,
        interviews: group.interviews.size,
        offers: group.offers.size,
        joined: group.joined.size,
        screeningRate: percentage(group.screened.size, group.profiles.size),
        interviewRate: percentage(group.interviews.size, group.screened.size),
        offerRate: percentage(group.offers.size, group.interviews.size),
        joiningRate: percentage(group.joined.size, group.offers.size),
      }))
      .sort((a, b) => b.profiles - a.profiles || a.label.localeCompare(b.label)),
  }
}

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { job: ['read'], candidate: ['read'], application: ['read'] })
  const orgId = session.session.activeOrganizationId
  const userId = session.user.id
  await assertRecruitmentAdmin(orgId, userId)

  const [requirementRows, historicalStageRows, sourceRows, sourceStageRows] = await Promise.all([
    db.select({
      jobId: job.id,
      title: job.title,
      status: job.status,
      ownerUserId: recruitmentRequirementState.ownerUserId,
      ownerName: user.name,
      assignmentDate: recruitmentRequirementState.assignmentDate,
      targetClosureDate: recruitmentRequirementState.targetClosureDate,
      closedAt: recruitmentRequirementState.closedAt,
    })
      .from(job)
      .leftJoin(recruitmentRequirementState, and(
        eq(recruitmentRequirementState.jobId, job.id),
        eq(recruitmentRequirementState.organizationId, orgId),
      ))
      .leftJoin(user, eq(user.id, recruitmentRequirementState.ownerUserId))
      .where(and(
        eq(job.organizationId, orgId),
        inArray(job.status, [...ACTIVE_REQUIREMENT_STATUSES]),
      )),
    db.select({
      applicationId: recruitmentEvidence.applicationId,
      payload: recruitmentEvidence.payload,
    })
      .from(recruitmentEvidence)
      .where(and(
        eq(recruitmentEvidence.organizationId, orgId),
        eq(recruitmentEvidence.type, 'stage_change'),
        gte(recruitmentEvidence.createdAt, HISTORICAL_TELEMETRY_START),
      )),
    db.select({
      applicationId: applicationSource.applicationId,
      channel: applicationSource.channel,
      utmSource: applicationSource.utmSource,
    })
      .from(applicationSource)
      .where(and(
        eq(applicationSource.organizationId, orgId),
        gte(applicationSource.createdAt, SOURCE_EFFECTIVENESS_START),
      )),
    db.select({
      applicationId: recruitmentEvidence.applicationId,
      payload: recruitmentEvidence.payload,
    })
      .from(recruitmentEvidence)
      .where(and(
        eq(recruitmentEvidence.organizationId, orgId),
        eq(recruitmentEvidence.type, 'stage_change'),
        gte(recruitmentEvidence.createdAt, SOURCE_EFFECTIVENESS_START),
      )),
  ])

  const historicalConversions = buildHistoricalConversions(historicalStageRows)
  const sourceEffectiveness = buildSourceEffectiveness(sourceRows, sourceStageRows)
  const requirementIds = requirementRows.map(row => row.jobId)
  if (requirementIds.length === 0) {
    return {
      generatedAt: new Date().toISOString(),
      summary: {
        openRequirements: 0,
        unallocatedRequirements: 0,
        activeCandidates: 0,
        profilesSourced: 0,
        screensCompleted: 0,
        overdueRequirements: 0,
        dueSoonRequirements: 0,
        averageOpenDays: 0,
      },
      ageing: { days0To30: 0, days31To45: 0, days46To60: 0, days61Plus: 0, tatNotStarted: 0 },
      stageFunnel: [],
      historicalConversions,
      sourceEffectiveness,
      recruiters: [],
      requirements: [],
      limitations: {
        sourceEffectiveness: 'Source effectiveness includes only applications attributed through the governed source taxonomy from the source-governance baseline. Older or legacy attribution is excluded.',
        historicalConversion: 'Historical conversion rates use governed stage-change events recorded from the telemetry baseline only. Earlier incomplete history is excluded.',
      },
    }
  }

  const [applicationRows, screeningRows] = await Promise.all([
    db.select({
      id: application.id,
      jobId: application.jobId,
      candidateId: application.candidateId,
      createdAt: application.createdAt,
      stage: recruitmentApplicationProfile.lastStatus,
    })
      .from(application)
      .leftJoin(recruitmentApplicationProfile, eq(recruitmentApplicationProfile.applicationId, application.id))
      .where(and(
        eq(application.organizationId, orgId),
        inArray(application.jobId, requirementIds),
      )),
    db.select({
      applicationId: recruiterScreeningSession.applicationId,
      status: recruiterScreeningSession.status,
      jobId: application.jobId,
    })
      .from(recruiterScreeningSession)
      .innerJoin(application, eq(application.id, recruiterScreeningSession.applicationId))
      .where(and(
        eq(recruiterScreeningSession.organizationId, orgId),
        eq(recruiterScreeningSession.status, 'completed'),
        inArray(application.jobId, requirementIds),
      )),
  ])

  const today = startOfToday()
  const sevenDays = new Date(today.getTime() + 7 * 86400000)
  const applicationsByJob = new Map<string, typeof applicationRows>()
  for (const row of applicationRows) {
    const list = applicationsByJob.get(row.jobId) ?? []
    list.push(row)
    applicationsByJob.set(row.jobId, list)
  }

  const screensByJob = new Map<string, number>()
  for (const row of screeningRows) screensByJob.set(row.jobId, (screensByJob.get(row.jobId) ?? 0) + 1)

  const ageing = { days0To30: 0, days31To45: 0, days46To60: 0, days61Plus: 0, tatNotStarted: 0 }
  const recruiterMap = new Map<string, {
    recruiterId: string | null
    recruiterName: string
    openRequirements: number
    profilesSourced: number
    screensCompleted: number
    activeCandidates: number
    overdueRequirements: number
    averageOpenDays: number
    openDaysTotal: number
    tatStarted: number
  }>()

  const requirements = requirementRows.map((row) => {
    const openDays = daysBetween(row.assignmentDate, today)
    if (openDays == null) ageing.tatNotStarted++
    else if (openDays <= 30) ageing.days0To30++
    else if (openDays <= 45) ageing.days31To45++
    else if (openDays <= 60) ageing.days46To60++
    else ageing.days61Plus++

    const target = row.targetClosureDate ? new Date(row.targetClosureDate) : null
    const overdue = Boolean(target && target < today)
    const dueSoon = Boolean(target && target >= today && target <= sevenDays)
    const jobApplications = applicationsByJob.get(row.jobId) ?? []
    const activeCandidates = jobApplications.filter(item => !TERMINAL_STAGES.includes((item.stage ?? '') as typeof TERMINAL_STAGES[number])).length
    const screensCompleted = screensByJob.get(row.jobId) ?? 0
    const recruiterKey = row.ownerUserId ?? '__unallocated__'
    const recruiter = recruiterMap.get(recruiterKey) ?? {
      recruiterId: row.ownerUserId,
      recruiterName: row.ownerName ?? 'Unallocated',
      openRequirements: 0,
      profilesSourced: 0,
      screensCompleted: 0,
      activeCandidates: 0,
      overdueRequirements: 0,
      averageOpenDays: 0,
      openDaysTotal: 0,
      tatStarted: 0,
    }
    recruiter.openRequirements++
    recruiter.profilesSourced += jobApplications.length
    recruiter.screensCompleted += screensCompleted
    recruiter.activeCandidates += activeCandidates
    if (overdue) recruiter.overdueRequirements++
    if (openDays != null) {
      recruiter.openDaysTotal += openDays
      recruiter.tatStarted++
    }
    recruiterMap.set(recruiterKey, recruiter)

    return {
      jobId: row.jobId,
      title: row.title,
      recruiterId: row.ownerUserId,
      recruiterName: row.ownerName ?? 'Unallocated',
      assignmentDate: row.assignmentDate,
      targetClosureDate: row.targetClosureDate,
      openDays,
      tatStarted: row.assignmentDate != null,
      overdue,
      dueSoon,
      profilesSourced: jobApplications.length,
      activeCandidates,
      screensCompleted,
    }
  })

  const stageCounts = new Map<string, number>()
  for (const row of applicationRows) {
    const group = stageGroup(row.stage)
    stageCounts.set(group, (stageCounts.get(group) ?? 0) + 1)
  }
  const stageOrder = [
    ['candidate_intake', 'Candidate Intake'],
    ['recruiter_screening', 'Recruiter Screening'],
    ['hiring_manager', 'Hiring Manager'],
    ['hod', 'HOD'],
    ['hr', 'HR'],
    ['offer', 'Offer'],
    ['joined', 'Joined'],
    ['closed_or_not_proceeding', 'Closed / Not Proceeding'],
  ] as const
  const stageFunnel = stageOrder.map(([key, label]) => ({ key, label, count: stageCounts.get(key) ?? 0 }))

  const recruiters = [...recruiterMap.values()]
    .map((row) => ({
      recruiterId: row.recruiterId,
      recruiterName: row.recruiterName,
      openRequirements: row.openRequirements,
      profilesSourced: row.profilesSourced,
      screensCompleted: row.screensCompleted,
      activeCandidates: row.activeCandidates,
      overdueRequirements: row.overdueRequirements,
      averageOpenDays: row.tatStarted ? Math.round(row.openDaysTotal / row.tatStarted) : null,
    }))
    .sort((a, b) => b.openRequirements - a.openRequirements || a.recruiterName.localeCompare(b.recruiterName))

  const startedRequirements = requirements.filter(row => row.openDays != null)
  const activeCandidates = applicationRows.filter(row => !TERMINAL_STAGES.includes((row.stage ?? '') as typeof TERMINAL_STAGES[number])).length

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      openRequirements: requirements.length,
      unallocatedRequirements: requirements.filter(row => !row.recruiterId).length,
      activeCandidates,
      profilesSourced: applicationRows.length,
      screensCompleted: screeningRows.length,
      overdueRequirements: requirements.filter(row => row.overdue).length,
      dueSoonRequirements: requirements.filter(row => row.dueSoon).length,
      averageOpenDays: startedRequirements.length
        ? Math.round(startedRequirements.reduce((total, row) => total + Number(row.openDays ?? 0), 0) / startedRequirements.length)
        : 0,
    },
    ageing,
    stageFunnel,
    historicalConversions,
    sourceEffectiveness,
    recruiters,
    requirements: requirements.sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
      if (a.dueSoon !== b.dueSoon) return a.dueSoon ? -1 : 1
      return Number(b.openDays ?? -1) - Number(a.openDays ?? -1)
    }),
    limitations: {
      sourceEffectiveness: 'Source effectiveness includes only applications attributed through the governed source taxonomy from the source-governance baseline. Older or legacy attribution is excluded.',
      historicalConversion: 'Historical conversion rates use governed stage-change events recorded from the telemetry baseline only. Earlier incomplete history is excluded.',
    },
  }
})