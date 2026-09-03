import { eq, and, desc, inArray } from 'drizzle-orm'
import { application, candidate, job, recruitmentApplicationProfile, recruitmentEvidence } from '../../database/schema'
import { applicationQuerySchema } from '../../utils/schemas/application'
import { propertyFiltersArraySchema } from '../../utils/schemas/property'
import { getVisibleRequirementIds } from '../../utils/recruitmentVisibility'
import {
  entityIdsMatchingFilters,
  loadPropertyEntriesForEntities,
  type PropertyFilter,
} from '../../utils/properties'

/**
 * GET /api/applications
 * Application list scoped to PDS requirement allocation. PDS recruitment state is
 * returned with each application so the requirement pipeline does not need to fall
 * back to legacy ATS scoring/interview state for recruiter workflow decisions.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['read'] })
  const orgId = session.session.activeOrganizationId
  const userId = session.user.id

  const query = await getValidatedQuery(event, applicationQuerySchema.parse)
  const visibleRequirementIds = await getVisibleRequirementIds(orgId, userId)

  if (visibleRequirementIds && visibleRequirementIds.length === 0) {
    return { data: [], total: 0, page: query.page, limit: query.limit }
  }

  if (query.jobId && visibleRequirementIds && !visibleRequirementIds.includes(query.jobId)) {
    return { data: [], total: 0, page: query.page, limit: query.limit }
  }

  const offset = (query.page - 1) * query.limit
  const conditions = [eq(application.organizationId, orgId)]

  if (visibleRequirementIds) conditions.push(inArray(application.jobId, visibleRequirementIds))
  if (query.jobId) conditions.push(eq(application.jobId, query.jobId))
  if (query.candidateId) conditions.push(eq(application.candidateId, query.candidateId))
  if (query.status) conditions.push(eq(application.status, query.status))

  let propertyFilters: PropertyFilter[] = []
  if (query.propertyFilters) {
    let raw: unknown
    try {
      raw = JSON.parse(query.propertyFilters)
    }
    catch {
      throw createError({ statusCode: 400, statusMessage: 'Invalid propertyFilters' })
    }
    const result = propertyFiltersArraySchema.safeParse(raw)
    if (!result.success) throw createError({ statusCode: 400, statusMessage: 'Invalid propertyFilters' })
    propertyFilters = result.data as PropertyFilter[]
  }

  if (propertyFilters.length > 0) {
    const matching = await entityIdsMatchingFilters({ organizationId: orgId, entityType: 'application', filters: propertyFilters })
    if (!matching || matching.size === 0) return { data: [], total: 0, page: query.page, limit: query.limit }
    conditions.push(inArray(application.id, [...matching]))
  }

  const where = and(...conditions)
  const [data, total] = await Promise.all([
    db.select({
      id: application.id,
      status: application.status,
      score: application.score,
      notes: application.notes,
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
      candidateId: application.candidateId,
      candidateFirstName: candidate.firstName,
      candidateLastName: candidate.lastName,
      candidateEmail: candidate.email,
      jobId: application.jobId,
      jobTitle: job.title,
      jobStatus: job.status,
      recruitmentStatus: recruitmentApplicationProfile.lastStatus,
      currentFit: recruitmentApplicationProfile.currentFit,
      provisionalFitScore: recruitmentApplicationProfile.provisionalFitScore,
      priority: recruitmentApplicationProfile.priority,
      mandatoryMatch: recruitmentApplicationProfile.mandatoryMatch,
      keyStrength: recruitmentApplicationProfile.keyStrength,
      mainGap: recruitmentApplicationProfile.mainGap,
      nextAction: recruitmentApplicationProfile.nextAction,
      assignedRecruiterId: recruitmentApplicationProfile.assignedRecruiterId,
      aiSummaryStale: recruitmentApplicationProfile.aiSummaryStale,
    })
      .from(application)
      .innerJoin(candidate, eq(candidate.id, application.candidateId))
      .innerJoin(job, eq(job.id, application.jobId))
      .leftJoin(recruitmentApplicationProfile, and(
        eq(recruitmentApplicationProfile.applicationId, application.id),
        eq(recruitmentApplicationProfile.organizationId, orgId),
      ))
      .where(where)
      .orderBy(desc(application.createdAt))
      .limit(query.limit)
      .offset(offset),
    db.$count(application, where),
  ])

  const ids = data.map(a => a.id)
  const jobIds = [...new Set(data.map(a => a.jobId))]
  const entityJobIds = new Map(data.map(a => [a.id, a.jobId] as const))
  const [propertyMap, movementRows] = await Promise.all([
    loadPropertyEntriesForEntities({
      organizationId: orgId,
      entityType: 'application',
      entityIds: ids,
      jobIds,
      entityJobIds,
    }),
    ids.length
      ? db.select({
          applicationId: recruitmentEvidence.applicationId,
          createdAt: recruitmentEvidence.createdAt,
        })
          .from(recruitmentEvidence)
          .where(and(
            eq(recruitmentEvidence.organizationId, orgId),
            eq(recruitmentEvidence.type, 'stage_change'),
            inArray(recruitmentEvidence.applicationId, ids),
          ))
          .orderBy(desc(recruitmentEvidence.createdAt))
      : Promise.resolve([]),
  ])

  const lastMovementByApplication = new Map<string, Date>()
  for (const row of movementRows) {
    if (!lastMovementByApplication.has(row.applicationId)) lastMovementByApplication.set(row.applicationId, row.createdAt)
  }

  return {
    data: data.map(a => ({
      ...a,
      lastMovementAt: lastMovementByApplication.get(a.id) ?? a.createdAt,
      properties: propertyMap.get(a.id) ?? [],
    })),
    total,
    page: query.page,
    limit: query.limit,
  }
})
