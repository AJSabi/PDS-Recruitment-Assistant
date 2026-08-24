import { and, eq, ne } from 'drizzle-orm'
import { application, job } from '../../database/schema/app'
import { recruitmentApplicationProfile, recruitmentRequirementState } from '../../database/schema/recruitmentWorkflow'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['read'] })
  const orgId = session.session.activeOrganizationId

  const jobs = await db.query.job.findMany({
    where: and(eq(job.organizationId, orgId), ne(job.status, 'closed')),
    columns: { id: true, title: true, status: true, location: true, createdAt: true },
  })

  const apps = await db.select({
    applicationId: application.id,
    jobId: application.jobId,
    currentFit: recruitmentApplicationProfile.currentFit,
    lastStatus: recruitmentApplicationProfile.lastStatus,
    nextAction: recruitmentApplicationProfile.nextAction,
    priority: recruitmentApplicationProfile.priority,
    updatedAt: recruitmentApplicationProfile.updatedAt,
  })
    .from(application)
    .leftJoin(recruitmentApplicationProfile, and(
      eq(recruitmentApplicationProfile.applicationId, application.id),
      eq(recruitmentApplicationProfile.organizationId, orgId),
    ))
    .where(eq(application.organizationId, orgId))

  const states = await db.query.recruitmentRequirementState.findMany({
    where: eq(recruitmentRequirementState.organizationId, orgId),
  })
  const stateMap = new Map(states.map(state => [state.jobId, state]))

  const requirements = jobs.map((requirement) => {
    const rows = apps.filter(row => row.jobId === requirement.id).map(row => ({
      ...row,
      currentFit: row.currentFit ?? 'not_yet_assessed',
      lastStatus: row.lastStatus ?? 'candidate_added',
      nextAction: row.nextAction ?? 'Upload or verify the latest resume.',
    }))
    const state = stateMap.get(requirement.id)
    const active = rows.filter(row => !['closed', 'joined', 'not_proceeding'].includes(row.lastStatus))
    return {
      ...requirement,
      totalCandidates: rows.length,
      activeCandidates: active.length,
      assessed: rows.filter(row => row.currentFit !== 'not_yet_assessed').length,
      notYetAssessed: rows.filter(row => row.currentFit === 'not_yet_assessed').length,
      screening: rows.filter(row => ['recruiter_screening_pending', 'recruiter_screening_completed'].includes(row.lastStatus)).length,
      hod: rows.filter(row => ['hod_round_pending', 'hod_round_completed'].includes(row.lastStatus)).length,
      offer: rows.filter(row => ['offer_stage', 'offer_accepted'].includes(row.lastStatus)).length,
      joined: rows.filter(row => row.lastStatus === 'joined').length,
      reassessmentRequired: Boolean(state?.reassessmentRequired),
      skillMatrixApproved: Boolean(state?.skillMatrixApproved),
      requirementRevision: state?.revision ?? 1,
      pendingActions: active.filter(row => Boolean(row.nextAction)).length,
      lastActivityAt: rows.reduce<Date | null>((latest, row) => {
        if (!row.updatedAt) return latest
        return !latest || row.updatedAt > latest ? row.updatedAt : latest
      }, null),
    }
  }).sort((a, b) => {
    if (a.reassessmentRequired !== b.reassessmentRequired) return a.reassessmentRequired ? -1 : 1
    if (a.pendingActions !== b.pendingActions) return b.pendingActions - a.pendingActions
    return a.title.localeCompare(b.title)
  })

  return {
    summary: {
      activeRequirements: requirements.length,
      totalCandidates: requirements.reduce((sum, row) => sum + row.totalCandidates, 0),
      activeCandidates: requirements.reduce((sum, row) => sum + row.activeCandidates, 0),
      notYetAssessed: requirements.reduce((sum, row) => sum + row.notYetAssessed, 0),
      reassessmentRequirements: requirements.filter(row => row.reassessmentRequired).length,
      offers: requirements.reduce((sum, row) => sum + row.offer, 0),
    },
    requirements,
  }
})
