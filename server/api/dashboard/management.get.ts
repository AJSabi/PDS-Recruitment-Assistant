import { and, eq, inArray, sql } from 'drizzle-orm'
import {
  application,
  job,
  recruitmentApplicationProfile,
  recruitmentRequirementState,
  recruiterScreeningSession,
  user,
} from '../../database/schema'
import { assertRecruitmentAdmin } from '../../utils/recruitmentVisibility'

const ACTIVE_REQUIREMENT_STATUSES = ['draft', 'open'] as const
const TERMINAL_STAGES = ['closed', 'joined', 'not_proceeding'] as const

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

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { job: ['read'], candidate: ['read'], application: ['read'] })
  const orgId = session.session.activeOrganizationId
  const userId = session.user.id
  await assertRecruitmentAdmin(orgId, userId)

  const requirementRows = await db.select({
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
    ))

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
      recruiters: [],
      requirements: [],
      limitations: {
        sourceEffectiveness: 'Application source is not captured as a governed field yet.',
        historicalConversion: 'Current stage is available, but complete historical stage-entry telemetry is not yet reliable enough for true conversion-rate reporting.',
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
    recruiters,
    requirements: requirements.sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
      if (a.dueSoon !== b.dueSoon) return a.dueSoon ? -1 : 1
      return Number(b.openDays ?? -1) - Number(a.openDays ?? -1)
    }),
    limitations: {
      sourceEffectiveness: 'Application source is not captured as a governed field yet.',
      historicalConversion: 'Current stage is available, but complete historical stage-entry telemetry is not yet reliable enough for true conversion-rate reporting.',
    },
  }
})
