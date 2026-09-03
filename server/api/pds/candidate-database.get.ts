import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import {
  application,
  candidate,
  document,
  job,
  member,
  recruitmentApplicationProfile,
  user,
} from '../../database/schema'
import { getVisibleRequirementIds } from '../../utils/recruitmentVisibility'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['read'] })
  const orgId = session.session.activeOrganizationId
  const visibleRequirementIds = await getVisibleRequirementIds(orgId, session.user.id)

  const applicationWhere = visibleRequirementIds === null
    ? eq(application.organizationId, orgId)
    : visibleRequirementIds.length
      ? and(eq(application.organizationId, orgId), inArray(application.jobId, visibleRequirementIds))
      : and(eq(application.organizationId, orgId), inArray(application.jobId, ['__no_visible_requirement__']))

  const [candidates, applications, resumes, users] = await Promise.all([
    db.select({ candidateId: candidate.id, firstName: candidate.firstName, lastName: candidate.lastName, email: candidate.email, phone: candidate.phone, createdAt: candidate.createdAt, updatedAt: candidate.updatedAt })
      .from(candidate).where(and(eq(candidate.organizationId, orgId), isNull(candidate.quarantinedAt))).orderBy(desc(candidate.updatedAt)),

    db.select({
      applicationId: application.id,
      candidateId: application.candidateId,
      jobId: application.jobId,
      jobTitle: job.title,
      applicationCreatedAt: application.createdAt,
      assignedRecruiterId: recruitmentApplicationProfile.assignedRecruiterId,
      currentFit: recruitmentApplicationProfile.currentFit,
      lastStatus: recruitmentApplicationProfile.lastStatus,
      statusDate: recruitmentApplicationProfile.statusDate,
      nextAction: recruitmentApplicationProfile.nextAction,
      priority: recruitmentApplicationProfile.priority,
      provisionalFitScore: recruitmentApplicationProfile.provisionalFitScore,
      aiCandidateSummary: recruitmentApplicationProfile.aiCandidateSummary,
      aiFinalBrief: recruitmentApplicationProfile.aiFinalBrief,
      aiSummaryStale: recruitmentApplicationProfile.aiSummaryStale,
      profileUpdatedAt: recruitmentApplicationProfile.updatedAt,
    }).from(application)
      .innerJoin(job, and(eq(job.id, application.jobId), eq(job.organizationId, orgId)))
      .leftJoin(recruitmentApplicationProfile, and(eq(recruitmentApplicationProfile.applicationId, application.id), eq(recruitmentApplicationProfile.organizationId, orgId)))
      .where(applicationWhere),

    db.select({ candidateId: document.candidateId, documentId: document.id, originalFilename: document.originalFilename, createdAt: document.createdAt })
      .from(document).where(and(eq(document.organizationId, orgId), eq(document.type, 'resume'))).orderBy(desc(document.createdAt)),

    db.select({ id: user.id, name: user.name })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, orgId)),
  ])

  const recruiterNames = new Map(users.map(row => [row.id, row.name]))
  const appsByCandidate = new Map<string, typeof applications>()
  for (const row of applications) {
    const list = appsByCandidate.get(row.candidateId) ?? []
    list.push(row)
    appsByCandidate.set(row.candidateId, list)
  }

  const resumesByCandidate = new Map<string, typeof resumes>()
  for (const row of resumes) {
    const list = resumesByCandidate.get(row.candidateId) ?? []
    list.push(row)
    resumesByCandidate.set(row.candidateId, list)
  }

  const terminalStatuses = new Set(['closed', 'joined', 'not_proceeding', 'offer_declined'])

  const rows = candidates.map((person) => {
    const candidateApps = (appsByCandidate.get(person.candidateId) ?? []).sort((a, b) => {
      const aTime = new Date(a.profileUpdatedAt ?? a.statusDate ?? a.applicationCreatedAt).getTime()
      const bTime = new Date(b.profileUpdatedAt ?? b.statusDate ?? b.applicationCreatedAt).getTime()
      return bTime - aTime
    })
    const activeApps = candidateApps.filter(row => !terminalStatuses.has(row.lastStatus ?? 'candidate_added'))
    const latest = activeApps[0] ?? candidateApps[0] ?? null
    const candidateResumes = resumesByCandidate.get(person.candidateId) ?? []
    const latestResume = candidateResumes[0] ?? null

    return {
      ...person,
      candidate: `${person.firstName} ${person.lastName}`.trim(),
      resumeCount: candidateResumes.length,
      latestResumeDocumentId: latestResume?.documentId ?? null,
      latestResumeFilename: latestResume?.originalFilename ?? null,
      latestResumeAt: latestResume?.createdAt ?? null,
      totalRequirements: candidateApps.length,
      activeRequirements: activeApps.length,
      latestApplicationId: latest?.applicationId ?? null,
      latestJobId: latest?.jobId ?? null,
      latestJobTitle: latest?.jobTitle ?? null,
      assignedRecruiterId: latest?.assignedRecruiterId ?? null,
      assignedRecruiter: latest?.assignedRecruiterId ? recruiterNames.get(latest.assignedRecruiterId) ?? 'Assigned Recruiter' : null,
      currentFit: latest?.currentFit ?? 'not_yet_assessed',
      lastStatus: latest?.lastStatus ?? (candidateApps.length ? 'candidate_added' : 'database_only'),
      statusDate: latest?.statusDate ?? latest?.applicationCreatedAt ?? null,
      nextAction: latest?.nextAction ?? (candidateApps.length ? 'Review candidate history.' : 'Available in candidate database.'),
      priority: latest?.priority ?? null,
      provisionalFitScore: latest?.provisionalFitScore ?? null,
      aiCandidateSummary: latest?.aiCandidateSummary ?? null,
      aiFinalBrief: latest?.aiFinalBrief ?? null,
      aiSummaryStale: latest?.aiSummaryStale ?? false,
      requirements: candidateApps.map(row => ({
        applicationId: row.applicationId,
        jobId: row.jobId,
        jobTitle: row.jobTitle,
        recruiter: row.assignedRecruiterId ? recruiterNames.get(row.assignedRecruiterId) ?? 'Assigned Recruiter' : null,
        currentFit: row.currentFit ?? 'not_yet_assessed',
        lastStatus: row.lastStatus ?? 'candidate_added',
        statusDate: row.statusDate ?? row.applicationCreatedAt,
        priority: row.priority,
        provisionalFitScore: row.provisionalFitScore,
        aiCandidateSummary: row.aiCandidateSummary ?? null,
        aiFinalBrief: row.aiFinalBrief ?? null,
        aiSummaryStale: row.aiSummaryStale ?? false,
      })),
    }
  })

  const summary = {
    totalCandidates: rows.length,
    withResume: rows.filter(row => row.resumeCount > 0).length,
    activeRecruitment: rows.filter(row => row.activeRequirements > 0).length,
    databaseOnly: rows.filter(row => row.totalRequirements === 0).length,
    unassignedActive: rows.filter(row => row.activeRequirements > 0 && !row.assignedRecruiterId).length,
  }

  return { summary, candidates: rows }
})