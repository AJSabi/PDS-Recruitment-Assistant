import { eq, and, desc, sql, count, inArray } from 'drizzle-orm'
import { application, candidate, job, recruitmentApplicationProfile, recruitmentRequirementState } from '../../database/schema'
import { getRequirementVisibility, getVisibleRequirementIds } from '../../utils/recruitmentVisibility'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { job: ['read'], candidate: ['read'], application: ['read'] })
  const orgId = session.session.activeOrganizationId
  const userId = session.user.id

  const [visibility, visibleRequirementIds] = await Promise.all([
    getRequirementVisibility(orgId, userId),
    getVisibleRequirementIds(orgId, userId),
  ])

  if (visibleRequirementIds && visibleRequirementIds.length === 0) {
    return {
      scope: { role: visibility.role, allocatedOnly: true },
      counts: { openJobs: 0, totalCandidates: 0, totalApplications: 0, newApplications: 0 },
      pipeline: { new: 0, screening: 0, interview: 0, offer: 0, hired: 0, rejected: 0 },
      jobsByStatus: { draft: 0, open: 0, closed: 0, archived: 0 },
      recentApplications: [],
      topJobs: [],
      recruitment: { overdueRequirements: 0, dueSoonRequirements: 0, actionPending: 0 },
    }
  }

  const jobScope = [eq(job.organizationId, orgId)]
  const applicationScope = [eq(application.organizationId, orgId)]
  if (visibleRequirementIds) {
    jobScope.push(inArray(job.id, visibleRequirementIds))
    applicationScope.push(inArray(application.jobId, visibleRequirementIds))
  }

  const activeRequirementCondition = sql`${job.status} in ('draft','open')`
  const nowDate = new Date()
  const sevenDaysDate = new Date(nowDate.getTime() + 7 * 24 * 60 * 60 * 1000)
  const now = nowDate.toISOString().slice(0, 10)
  const sevenDays = sevenDaysDate.toISOString().slice(0, 10)

  const [
    openJobsCount,
    totalCandidatesRows,
    totalApplicationsCount,
    newApplicationsCount,
    pipelineRows,
    jobStatusRows,
    recentApplications,
    topJobs,
    overdueRows,
    dueSoonRows,
    actionPendingRows,
  ] = await Promise.all([
    db.$count(job, and(...jobScope, activeRequirementCondition)),

    db.select({ count: sql<number>`count(distinct ${application.candidateId})` })
      .from(application)
      .where(and(...applicationScope)),

    db.$count(application, and(...applicationScope)),
    db.$count(application, and(...applicationScope, eq(application.status, 'new'))),

    db.select({ status: application.status, count: count().as('count') })
      .from(application)
      .where(and(...applicationScope))
      .groupBy(application.status),

    db.select({ status: job.status, count: count().as('count') })
      .from(job)
      .where(and(...jobScope))
      .groupBy(job.status),

    db.select({
      id: application.id,
      status: application.status,
      createdAt: application.createdAt,
      candidateId: application.candidateId,
      candidateFirstName: candidate.firstName,
      candidateLastName: candidate.lastName,
      candidateEmail: candidate.email,
      jobId: application.jobId,
      jobTitle: job.title,
      recruitmentStatus: recruitmentApplicationProfile.lastStatus,
      nextAction: recruitmentApplicationProfile.nextAction,
      priority: recruitmentApplicationProfile.priority,
    })
      .from(application)
      .innerJoin(candidate, eq(candidate.id, application.candidateId))
      .innerJoin(job, eq(job.id, application.jobId))
      .leftJoin(recruitmentApplicationProfile, eq(recruitmentApplicationProfile.applicationId, application.id))
      .where(and(...applicationScope))
      .orderBy(desc(application.createdAt))
      .limit(8),

    db.select({
      id: job.id,
      title: job.title,
      slug: job.slug,
      status: job.status,
      createdAt: job.createdAt,
      targetClosureDate: recruitmentRequirementState.targetClosureDate,
      applicationCount: count(application.id).as('application_count'),
      newCount: sql<number>`count(case when ${application.status} = 'new' then 1 end)`.as('new_count'),
      screeningCount: sql<number>`count(case when ${application.status} = 'screening' then 1 end)`.as('screening_count'),
      interviewCount: sql<number>`count(case when ${application.status} = 'interview' then 1 end)`.as('interview_count'),
      offerCount: sql<number>`count(case when ${application.status} = 'offer' then 1 end)`.as('offer_count'),
      hiredCount: sql<number>`count(case when ${application.status} = 'hired' then 1 end)`.as('hired_count'),
      rejectedCount: sql<number>`count(case when ${application.status} = 'rejected' then 1 end)`.as('rejected_count'),
    })
      .from(job)
      .leftJoin(application, and(eq(application.jobId, job.id), eq(application.organizationId, orgId)))
      .leftJoin(recruitmentRequirementState, and(eq(recruitmentRequirementState.jobId, job.id), eq(recruitmentRequirementState.organizationId, orgId)))
      .where(and(...jobScope, activeRequirementCondition))
      .groupBy(job.id, recruitmentRequirementState.targetClosureDate)
      .orderBy(desc(job.updatedAt))
      .limit(8),

    db.select({ count: count() })
      .from(recruitmentRequirementState)
      .innerJoin(job, eq(job.id, recruitmentRequirementState.jobId))
      .where(and(
        eq(recruitmentRequirementState.organizationId, orgId),
        eq(job.status, 'open'),
        sql`${recruitmentRequirementState.targetClosureDate} is not null and ${recruitmentRequirementState.targetClosureDate} < ${now}::date`,
        ...(visibleRequirementIds ? [inArray(recruitmentRequirementState.jobId, visibleRequirementIds)] : []),
      )),

    db.select({ count: count() })
      .from(recruitmentRequirementState)
      .innerJoin(job, eq(job.id, recruitmentRequirementState.jobId))
      .where(and(
        eq(recruitmentRequirementState.organizationId, orgId),
        eq(job.status, 'open'),
        sql`${recruitmentRequirementState.targetClosureDate} is not null and ${recruitmentRequirementState.targetClosureDate} >= ${now}::date and ${recruitmentRequirementState.targetClosureDate} <= ${sevenDays}::date`,
        ...(visibleRequirementIds ? [inArray(recruitmentRequirementState.jobId, visibleRequirementIds)] : []),
      )),

    db.select({ count: count() })
      .from(recruitmentApplicationProfile)
      .innerJoin(application, eq(application.id, recruitmentApplicationProfile.applicationId))
      .where(and(
        eq(recruitmentApplicationProfile.organizationId, orgId),
        sql`${recruitmentApplicationProfile.lastStatus} not in ('closed','joined','not_proceeding')`,
        ...(visibleRequirementIds ? [inArray(application.jobId, visibleRequirementIds)] : []),
      )),
  ])

  const pipeline: Record<string, number> = { new: 0, screening: 0, interview: 0, offer: 0, hired: 0, rejected: 0 }
  for (const row of pipelineRows) pipeline[row.status] = row.count

  const jobsByStatus: Record<string, number> = { draft: 0, open: 0, closed: 0, archived: 0 }
  for (const row of jobStatusRows) jobsByStatus[row.status] = row.count

  return {
    scope: { role: visibility.role, allocatedOnly: !visibility.canSeeAll },
    counts: {
      openJobs: openJobsCount,
      totalCandidates: Number(totalCandidatesRows[0]?.count ?? 0),
      totalApplications: totalApplicationsCount,
      newApplications: newApplicationsCount,
    },
    pipeline,
    jobsByStatus,
    recentApplications,
    topJobs,
    recruitment: {
      overdueRequirements: Number(overdueRows[0]?.count ?? 0),
      dueSoonRequirements: Number(dueSoonRows[0]?.count ?? 0),
      actionPending: Number(actionPendingRows[0]?.count ?? 0),
    },
  }
})
