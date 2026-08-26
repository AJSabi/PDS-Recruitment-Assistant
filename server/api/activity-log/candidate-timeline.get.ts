import { eq, and, desc, or, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { activityLog, user, application, job, candidate } from '../../database/schema'
import { getVisibleRequirementIds } from '../../utils/recruitmentVisibility'

const querySchema = z.object({
  candidateId: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { activityLog: ['read'] })
  const orgId = session.session.activeOrganizationId
  const query = await getValidatedQuery(event, querySchema.parse)
  const visibleRequirementIds = await getVisibleRequirementIds(orgId, session.user.id)

  const candidateRow = await db.query.candidate.findFirst({
    where: and(eq(candidate.id, query.candidateId), eq(candidate.organizationId, orgId)),
    columns: { id: true, firstName: true, lastName: true },
  })
  if (!candidateRow) throw createError({ statusCode: 404, statusMessage: 'Candidate not found' })

  const applicationConditions = [
    eq(application.organizationId, orgId),
    eq(application.candidateId, query.candidateId),
  ]
  if (visibleRequirementIds) {
    if (visibleRequirementIds.length === 0) {
      applicationConditions.push(eq(application.id, '__none__'))
    } else {
      applicationConditions.push(inArray(application.jobId, visibleRequirementIds))
    }
  }

  const candidateApps = await db.select({ id: application.id })
    .from(application)
    .where(and(...applicationConditions))
  const appIds = candidateApps.map(a => a.id)

  const resourceConditions = [
    and(eq(activityLog.resourceType, 'candidate'), eq(activityLog.resourceId, query.candidateId)),
  ]
  if (appIds.length > 0) {
    resourceConditions.push(and(eq(activityLog.resourceType, 'application'), inArray(activityLog.resourceId, appIds)))
  }

  const data = await db.select({
    id: activityLog.id,
    action: activityLog.action,
    resourceType: activityLog.resourceType,
    resourceId: activityLog.resourceId,
    metadata: activityLog.metadata,
    createdAt: activityLog.createdAt,
    actorId: activityLog.actorId,
    actorName: user.name,
    actorEmail: user.email,
    actorImage: user.image,
  }).from(activityLog)
    .innerJoin(user, eq(user.id, activityLog.actorId))
    .where(and(eq(activityLog.organizationId, orgId), or(...resourceConditions)))
    .orderBy(desc(activityLog.createdAt))
    .limit(query.limit)

  let appJobMap = new Map<string, { jobId: string; jobTitle: string }>()
  if (appIds.length > 0) {
    const appJobs = await db.select({ id: application.id, jobId: application.jobId, jobTitle: job.title })
      .from(application)
      .innerJoin(job, eq(job.id, application.jobId))
      .where(and(eq(application.organizationId, orgId), inArray(application.id, appIds)))
    appJobMap = new Map(appJobs.map(a => [a.id, { jobId: a.jobId, jobTitle: a.jobTitle }]))
  }

  const candidateName = `${candidateRow.firstName} ${candidateRow.lastName}`
  const items = data.map((item) => {
    let resourceName: string | null = null
    let jobTitle: string | null = null
    if (item.resourceType === 'candidate') {
      resourceName = candidateName
    } else if (item.resourceType === 'application') {
      const info = appJobMap.get(item.resourceId)
      if (info) {
        resourceName = `${candidateName} → ${info.jobTitle}`
        jobTitle = info.jobTitle
      }
    }
    return { ...item, resourceName, jobTitle, candidateName }
  })

  return { items, candidateId: query.candidateId, candidateName }
})
