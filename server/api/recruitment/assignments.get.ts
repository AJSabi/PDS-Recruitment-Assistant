import { and, eq } from 'drizzle-orm'
import { application, candidate, job } from '../../database/schema/app'
import { recruitmentApplicationProfile } from '../../database/schema/recruitmentWorkflow'
import { member, user } from '../../database/schema/auth'
import { assertRecruitmentAdmin } from '../../utils/recruitmentVisibility'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['read'] })
  const orgId = session.session.activeOrganizationId
  await assertRecruitmentAdmin(orgId, session.user.id)

  const [rows, recruiters] = await Promise.all([
    db.select({
      applicationId: application.id,
      candidateId: candidate.id,
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      email: candidate.email,
      jobId: job.id,
      jobTitle: job.title,
      assignedRecruiterId: recruitmentApplicationProfile.assignedRecruiterId,
      lastStatus: recruitmentApplicationProfile.lastStatus,
      currentFit: recruitmentApplicationProfile.currentFit,
      priority: recruitmentApplicationProfile.priority,
      nextAction: recruitmentApplicationProfile.nextAction,
      statusDate: recruitmentApplicationProfile.statusDate,
    })
      .from(application)
      .innerJoin(candidate, eq(candidate.id, application.candidateId))
      .innerJoin(job, eq(job.id, application.jobId))
      .leftJoin(recruitmentApplicationProfile, and(
        eq(recruitmentApplicationProfile.applicationId, application.id),
        eq(recruitmentApplicationProfile.organizationId, orgId),
      ))
      .where(eq(application.organizationId, orgId)),
    db.select({ id: user.id, name: user.name, email: user.email, role: member.role })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, orgId)),
  ])

  const activeStatuses = new Set(['candidate_added','resume_received','resume_reviewed','recruiter_screening_pending','recruiter_screening_completed','hod_round_pending','hod_round_completed','hold_for_comparison','reassess','offer_stage','offer_accepted'])
  const now = Date.now()
  const assignments = rows.map(row => ({
    ...row,
    candidate: `${row.firstName} ${row.lastName}`.trim(),
    lastStatus: row.lastStatus ?? 'candidate_added',
    currentFit: row.currentFit ?? 'not_yet_assessed',
    nextAction: row.nextAction ?? 'Open recruitment workflow',
    active: activeStatuses.has(row.lastStatus ?? 'candidate_added'),
    daysInStage: row.statusDate ? Math.max(0, Math.floor((now - new Date(row.statusDate).getTime()) / 86_400_000)) : 0,
  }))

  return {
    recruiters: recruiters.sort((a, b) => a.name.localeCompare(b.name)),
    summary: {
      total: assignments.length,
      active: assignments.filter(row => row.active).length,
      assigned: assignments.filter(row => row.active && row.assignedRecruiterId).length,
      unassigned: assignments.filter(row => row.active && !row.assignedRecruiterId).length,
      ageing3Plus: assignments.filter(row => row.active && row.daysInStage >= 3).length,
      ageing7Plus: assignments.filter(row => row.active && row.daysInStage >= 7).length,
    },
    assignments,
  }
})
