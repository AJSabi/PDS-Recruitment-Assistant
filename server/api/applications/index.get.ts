import { eq, and, desc, inArray } from 'drizzle-orm'
import { application, candidate, job } from '../../database/schema'
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
 * Legacy application list retained for compatibility, but scoped to the same
 * PDS requirement-allocation visibility used by the recruiter workspace.
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
    })
      .from(application)
      .innerJoin(candidate, eq(candidate.id, application.candidateId))
      .innerJoin(job, eq(job.id, application.jobId))
      .where(where)
      .orderBy(desc(application.createdAt))
      .limit(query.limit)
      .offset(offset),
    db.$count(application, where),
  ])

  const ids = data.map(a => a.id)
  const jobIds = [...new Set(data.map(a => a.jobId))]
  const entityJobIds = new Map(data.map(a => [a.id, a.jobId] as const))
  const propertyMap = await loadPropertyEntriesForEntities({
    organizationId: orgId,
    entityType: 'application',
    entityIds: ids,
    jobIds,
    entityJobIds,
  })

  return {
    data: data.map(a => ({ ...a, properties: propertyMap.get(a.id) ?? [] })),
    total,
    page: query.page,
    limit: query.limit,
  }
})
