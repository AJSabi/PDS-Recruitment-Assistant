import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { application, candidate, job, recruitmentApplicationProfile } from '../../database/schema'
import { getVisibleRequirementIds } from '../../utils/recruitmentVisibility'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { job: ['read'], candidate: ['read'], application: ['read'] })
  const orgId = session.session.activeOrganizationId
  const visibleRequirementIds = await getVisibleRequirementIds(orgId, session.user.id)
  if (visibleRequirementIds && visibleRequirementIds.length === 0) return { data: [] }

  const scope = [
    eq(application.organizationId, orgId),
    eq(recruitmentApplicationProfile.organizationId, orgId),
    sql`${job.status} in ('draft','open')`,
    sql`${recruitmentApplicationProfile.lastStatus} not in ('closed','joined','not_proceeding')`,
  ]
  if (visibleRequirementIds) scope.push(inArray(application.jobId, visibleRequirementIds))

  const rows = await db.select({
    id: application.id,
    jobId: application.jobId,
    jobTitle: job.title,
    candidateId: application.candidateId,
    candidateFirstName: candidate.firstName,
    candidateLastName: candidate.lastName,
    candidateEmail: candidate.email,
    recruitmentStatus: recruitmentApplicationProfile.lastStatus,
    currentFit: recruitmentApplicationProfile.currentFit,
    priority: recruitmentApplicationProfile.priority,
    nextAction: recruitmentApplicationProfile.nextAction,
    statusDate: recruitmentApplicationProfile.statusDate,
  })
    .from(recruitmentApplicationProfile)
    .innerJoin(application, eq(application.id, recruitmentApplicationProfile.applicationId))
    .innerJoin(candidate, eq(candidate.id, application.candidateId))
    .innerJoin(job, eq(job.id, application.jobId))
    .where(and(...scope))
    .orderBy(desc(recruitmentApplicationProfile.statusDate))
    .limit(200)

  return { data: rows }
})
