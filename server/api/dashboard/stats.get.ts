import { eq, and, desc, sql, count, inArray, isNotNull } from 'drizzle-orm'
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
      recruitment: {
        overdueRequirements: 0,
        dueSoonRequirements: 0,
        actionPending: 0,
        activeRequirementAging: {
          averageDays: 0,
          oldestDays: 0,
          allocatedRequirements: 0,
          unallocatedRequirements: 0,
          buckets: { days0to15: 0, days16to30: 0, days31to45: 0, days46to60: 0, days61plus: 0 },
        },
      },
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
    agingRows,
  ] = await Promise.all([
    db.$count(job, and(...jobScope, activeRequirementCondition)),

    db.select({ count: sql<number>`count(distinct ${application.candidateId})` })
      .from(application)
      .innerJoin(job, eq(job.id, application.jobId))
      .leftJoin(recruitmentApplicationProfile, eq(recruitmentApplicationProfile.applicationId, application.id))
      .where(and(
        ...applicationScope,
        activeRequirementCondition,
        sql`(${recruitmentApplicationProfile.lastStatus} is null or ${recruitmentApplicationProfile.lastStatus} not in ('closed','joined','not_proceeding'))`,
      )),

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
      assignmentDate: recruitmentRequirementState.assignmentDate,
      targetClosureDate: recruitmentRequirementState.targetClosureDate,
      closedAt: recruitmentRequirementState.closedAt,
      ownerUserId: recruitmentRequirementState.ownerUserId,
      openDays: sql<number | null>`case when ${recruitmentRequirementState.assignmentDate} is null then null else greatest(0, (current_date - ${recruitmentRequirementState.assignmentDate}::date)) end`.as('open_days'),
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
      .groupBy(
        job.id,
        recruitmentRequirementState.assignmentDate,
        recruitmentRequirementState.targetClosureDate,
        recruitmentRequirementState.closedAt,
        recruitmentRequirementState.ownerUserId,
      )
      // Owner/admin retain organisation-wide visibility, but their own allocated work is
      // surfaced first so test/demo requirements cannot crowd an assigned requirement out.
      .orderBy(
        sql`case when ${recruitmentRequirementState.ownerUserId} = ${userId} then 0 else 1 end`,
        desc(job.updatedAt),
      )
      .limit(16),

    db.select({ count: count() })
      .from(recruitmentRequirementState)
      .innerJoin(job, eq(job.id, recruitmentRequirementState.jobId))
      .where(and(
        eq(recruitmentRequirementState.organizationId, orgId),
        activeRequirementCondition,
        sql`${recruitmentRequirementState.targetClosureDate} is not null and ${recruitmentRequirementState.targetClosureDate} < ${now}::date`,
        ...(visibleRequirementIds ? [inArray(recruitmentRequirementState.jobId, visibleRequirementIds)] : []),
      )),

    db.select({ count: count() })
      .from(recruitmentRequirementState)
      .innerJoin(job, eq(job.id, recruitmentRequirementState.jobId))
      .where(and(
        eq(recruitmentRequirementState.organizationId, orgId),
        activeRequirementCondition,
        sql`${recruitmentRequirementState.targetClosureDate} is not null and ${recruitmentRequirementState.targetClosureDate} >= ${now}::date and ${recruitmentRequirementState.targetClosureDate} <= ${sevenDays}::date`,
        ...(visibleRequirementIds ? [inArray(recruitmentRequirementState.jobId, visibleRequirementIds)] : []),
      )),

    db.select({ count: count() })
      .from(recruitmentApplicationProfile)
      .innerJoin(application, eq(application.id, recruitmentApplicationProfile.applicationId))
      .innerJoin(job, eq(job.id, application.jobId))
      .where(and(
        eq(recruitmentApplicationProfile.organizationId, orgId),
        activeRequirementCondition,
        sql`${recruitmentApplicationProfile.lastStatus} not in ('closed','joined','not_proceeding')`,
        isNotNull(recruitmentApplicationProfile.nextAction),
        sql`trim(${recruitmentApplicationProfile.nextAction}) <> ''`,
        ...(visibleRequirementIds ? [inArray(application.jobId, visibleRequirementIds)] : []),
      )),

    db.select({
      allocatedRequirements: sql<number>`count(*) filter (where ${recruitmentRequirementState.assignmentDate} is not null)`.as('allocated_requirements'),
      unallocatedRequirements: sql<number>`count(*) filter (where ${recruitmentRequirementState.assignmentDate} is null)`.as('unallocated_requirements'),
      averageDays: sql<number>`coalesce(round(avg(greatest(0, current_date - ${recruitmentRequirementState.assignmentDate}::date)) filter (where ${recruitmentRequirementState.assignmentDate} is not null)), 0)`.as('average_days'),
      oldestDays: sql<number>`coalesce(max(greatest(0, current_date - ${recruitmentRequirementState.assignmentDate}::date)) filter (where ${recruitmentRequirementState.assignmentDate} is not null), 0)`.as('oldest_days'),
      days0to15: sql<number>`count(*) filter (where ${recruitmentRequirementState.assignmentDate} is not null and greatest(0, current_date - ${recruitmentRequirementState.assignmentDate}::date) between 0 and 15)`.as('days_0_15'),
      days16to30: sql<number>`count(*) filter (where ${recruitmentRequirementState.assignmentDate} is not null and greatest(0, current_date - ${recruitmentRequirementState.assignmentDate}::date) between 16 and 30)`.as('days_16_30'),
      days31to45: sql<number>`count(*) filter (where ${recruitmentRequirementState.assignmentDate} is not null and greatest(0, current_date - ${recruitmentRequirementState.assignmentDate}::date) between 31 and 45)`.as('days_31_45'),
      days46to60: sql<number>`count(*) filter (where ${recruitmentRequirementState.assignmentDate} is not null and greatest(0, current_date - ${recruitmentRequirementState.assignmentDate}::date) between 46 and 60)`.as('days_46_60'),
      days61plus: sql<number>`count(*) filter (where ${recruitmentRequirementState.assignmentDate} is not null and greatest(0, current_date - ${recruitmentRequirementState.assignmentDate}::date) >= 61)`.as('days_61_plus'),
    })
      .from(job)
      .leftJoin(recruitmentRequirementState, and(
        eq(recruitmentRequirementState.jobId, job.id),
        eq(recruitmentRequirementState.organizationId, orgId),
      ))
      .where(and(...jobScope, activeRequirementCondition)),
  ])

  const pipeline: Record<string, number> = { new: 0, screening: 0, interview: 0, offer: 0, hired: 0, rejected: 0 }
  for (const row of pipelineRows) pipeline[row.status] = row.count

  const jobsByStatus: Record<string, number> = { draft: 0, open: 0, closed: 0, archived: 0 }
  for (const row of jobStatusRows) jobsByStatus[row.status] = row.count

  const aging = agingRows[0]

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
      activeRequirementAging: {
        averageDays: Number(aging?.averageDays ?? 0),
        oldestDays: Number(aging?.oldestDays ?? 0),
        allocatedRequirements: Number(aging?.allocatedRequirements ?? 0),
        unallocatedRequirements: Number(aging?.unallocatedRequirements ?? 0),
        buckets: {
          days0to15: Number(aging?.days0to15 ?? 0),
          days16to30: Number(aging?.days16to30 ?? 0),
          days31to45: Number(aging?.days31to45 ?? 0),
          days46to60: Number(aging?.days46to60 ?? 0),
          days61plus: Number(aging?.days61plus ?? 0),
        },
      },
    },
  }
})
