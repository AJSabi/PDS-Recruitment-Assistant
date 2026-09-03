import { and, eq } from 'drizzle-orm'
import { application, candidate, job } from '../../database/schema/app'
import { recruitmentApplicationProfile, recruitmentRequirementState } from '../../database/schema/recruitmentWorkflow'

const ACTIVE_STATUSES = new Set([
  'candidate_added', 'resume_received', 'resume_reviewed', 'recruiter_screening_pending',
  'recruiter_screening_completed', 'hod_round_pending', 'hod_round_completed',
  'hold_for_comparison', 'reassess', 'offer_stage', 'offer_accepted',
])

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['read'] })
  const orgId = session.session.activeOrganizationId
  const userId = session.user.id

  const rows = await db.select({
    applicationId: application.id,
    candidateId: candidate.id,
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    email: candidate.email,
    phone: candidate.phone,
    jobId: job.id,
    jobTitle: job.title,
    jobStatus: job.status,
    currentFit: recruitmentApplicationProfile.currentFit,
    lastStatus: recruitmentApplicationProfile.lastStatus,
    statusDate: recruitmentApplicationProfile.statusDate,
    nextAction: recruitmentApplicationProfile.nextAction,
    priority: recruitmentApplicationProfile.priority,
    provisionalFitScore: recruitmentApplicationProfile.provisionalFitScore,
    lastContactAt: recruitmentApplicationProfile.lastContactAt,
    updatedAt: recruitmentApplicationProfile.updatedAt,
  })
    .from(recruitmentApplicationProfile)
    .innerJoin(application, eq(application.id, recruitmentApplicationProfile.applicationId))
    .innerJoin(candidate, eq(candidate.id, application.candidateId))
    .innerJoin(job, eq(job.id, application.jobId))
    .where(and(
      eq(recruitmentApplicationProfile.organizationId, orgId),
      eq(recruitmentApplicationProfile.assignedRecruiterId, userId),
    ))

  const now = Date.now()
  const work = rows.map((row) => {
    const statusDate = row.statusDate ? new Date(row.statusDate).getTime() : now
    const daysInStage = Math.max(0, Math.floor((now - statusDate) / 86_400_000))
    return {
      ...row,
      candidate: `${row.firstName} ${row.lastName}`.trim(),
      currentFit: row.currentFit ?? 'not_yet_assessed',
      lastStatus: row.lastStatus ?? 'candidate_added',
      nextAction: row.nextAction ?? 'Open recruitment workflow',
      daysInStage,
      active: ACTIVE_STATUSES.has(row.lastStatus ?? 'candidate_added'),
    }
  }).sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1
    if (a.daysInStage !== b.daysInStage) return b.daysInStage - a.daysInStage
    return (a.candidate ?? '').localeCompare(b.candidate ?? '')
  })

  const ownedRequirements = await db.select({ jobId: recruitmentRequirementState.jobId })
    .from(recruitmentRequirementState)
    .where(and(
      eq(recruitmentRequirementState.organizationId, orgId),
      eq(recruitmentRequirementState.ownerUserId, userId),
    ))

  const active = work.filter(row => row.active)

  return {
    user: { id: userId, name: session.user.name, email: session.user.email },
    summary: {
      ownedRequirements: ownedRequirements.length,
      assignedCandidates: work.length,
      activeCandidates: active.length,
      notYetAssessed: active.filter(row => row.currentFit === 'not_yet_assessed').length,
      screening: active.filter(row => ['recruiter_screening_pending', 'recruiter_screening_completed'].includes(row.lastStatus)).length,
      hod: active.filter(row => ['hod_round_pending', 'hod_round_completed'].includes(row.lastStatus)).length,
      offer: active.filter(row => ['offer_stage', 'offer_accepted'].includes(row.lastStatus)).length,
      ageing3Plus: active.filter(row => row.daysInStage >= 3).length,
      ageing7Plus: active.filter(row => row.daysInStage >= 7).length,
    },
    work,
  }
})
