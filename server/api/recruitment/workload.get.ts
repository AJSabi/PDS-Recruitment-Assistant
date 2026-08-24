import { and, eq, ne } from 'drizzle-orm'
import { application, job } from '../../database/schema/app'
import { member, user } from '../../database/schema/auth'
import { recruitmentApplicationProfile, recruitmentRequirementState } from '../../database/schema/recruitmentWorkflow'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['read'] })
  const orgId = session.session.activeOrganizationId

  const [members, profiles, states] = await Promise.all([
    db.select({ id: user.id, name: user.name, email: user.email, role: member.role })
      .from(member).innerJoin(user, eq(user.id, member.userId)).where(eq(member.organizationId, orgId)),
    db.select({
      applicationId: application.id,
      jobId: application.jobId,
      recruiterId: recruitmentApplicationProfile.assignedRecruiterId,
      status: recruitmentApplicationProfile.lastStatus,
      currentFit: recruitmentApplicationProfile.currentFit,
      nextAction: recruitmentApplicationProfile.nextAction,
    }).from(application)
      .leftJoin(recruitmentApplicationProfile, and(eq(recruitmentApplicationProfile.applicationId, application.id), eq(recruitmentApplicationProfile.organizationId, orgId)))
      .where(eq(application.organizationId, orgId)),
    db.select({ jobId: recruitmentRequirementState.jobId, ownerUserId: recruitmentRequirementState.ownerUserId })
      .from(recruitmentRequirementState).where(eq(recruitmentRequirementState.organizationId, orgId)),
  ])

  const activeStatuses = new Set(['candidate_added','resume_received','resume_reviewed','recruiter_screening_pending','recruiter_screening_completed','hod_round_pending','hod_round_completed','hold_for_comparison','reassess','offer_stage','offer_accepted'])

  const recruiters = members.map((person) => {
    const assigned = profiles.filter(row => row.recruiterId === person.id)
    const active = assigned.filter(row => activeStatuses.has(row.status ?? 'candidate_added'))
    return {
      ...person,
      ownedRequirements: states.filter(state => state.ownerUserId === person.id).length,
      totalCandidates: assigned.length,
      activeCandidates: active.length,
      notYetAssessed: assigned.filter(row => (row.currentFit ?? 'not_yet_assessed') === 'not_yet_assessed').length,
      screening: assigned.filter(row => ['recruiter_screening_pending','recruiter_screening_completed'].includes(row.status ?? '')).length,
      hod: assigned.filter(row => ['hod_round_pending','hod_round_completed'].includes(row.status ?? '')).length,
      offer: assigned.filter(row => ['offer_stage','offer_accepted'].includes(row.status ?? '')).length,
      pendingActions: active.filter(row => Boolean(row.nextAction)).length,
    }
  }).sort((a, b) => b.activeCandidates - a.activeCandidates || a.name.localeCompare(b.name))

  const unassigned = profiles.filter(row => !row.recruiterId && activeStatuses.has(row.status ?? 'candidate_added'))

  return {
    summary: {
      recruiters: recruiters.length,
      activeCandidates: recruiters.reduce((sum, row) => sum + row.activeCandidates, 0),
      unassignedCandidates: unassigned.length,
      unownedRequirements: states.filter(state => !state.ownerUserId).length,
    },
    recruiters,
  }
})
