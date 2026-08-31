import { eq, and, or, ilike, desc, sql, gte, lte, inArray, isNull } from 'drizzle-orm'
import { candidate, application, recruitmentRequirementState } from '../../database/schema'
import { candidateQuerySchema } from '../../utils/schemas/candidate'
import { propertyFiltersArraySchema } from '../../utils/schemas/property'
import { getRequirementVisibility } from '../../utils/recruitmentVisibility'
import {
  entityIdsMatchingFilters,
  loadPropertyEntriesForEntities,
  type PropertyFilter,
} from '../../utils/properties'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { candidate: ['read'] })
  const orgId = session.session.activeOrganizationId
  const query = await getValidatedQuery(event, candidateQuerySchema.parse)
  const offset = (query.page - 1) * query.limit
  const conditions = [eq(candidate.organizationId, orgId), isNull(candidate.quarantinedAt)]

  if (query.search) {
    const escaped = query.search.replace(/[%_\\]/g, '\\$&')
    const pattern = `%${escaped}%`
    conditions.push(or(ilike(candidate.firstName, pattern), ilike(candidate.lastName, pattern), ilike(candidate.email, pattern))!)
  }
  if (query.gender) conditions.push(eq(candidate.gender, query.gender))
  if (query.dobFrom) conditions.push(gte(candidate.dateOfBirth, query.dobFrom))
  if (query.dobTo) conditions.push(lte(candidate.dateOfBirth, query.dobTo))

  let propertyFilters: PropertyFilter[] = []
  if (query.propertyFilters) {
    let raw: unknown
    try { raw = JSON.parse(query.propertyFilters) } catch { throw createError({ statusCode: 400, statusMessage: 'Invalid propertyFilters' }) }
    const result = propertyFiltersArraySchema.safeParse(raw)
    if (!result.success) throw createError({ statusCode: 400, statusMessage: 'Invalid propertyFilters' })
    propertyFilters = result.data as PropertyFilter[]
  }
  if (propertyFilters.length > 0) {
    const matching = await entityIdsMatchingFilters({ organizationId: orgId, entityType: 'candidate', filters: propertyFilters })
    if (!matching || matching.size === 0) return { data: [], total: 0, page: query.page, limit: query.limit }
    conditions.push(inArray(candidate.id, [...matching]))
  }

  const where = and(...conditions)
  const visibility = await getRequirementVisibility(orgId, session.user.id)

  const dataQuery = visibility.canSeeAll
    ? db.select({
        id: candidate.id, firstName: candidate.firstName, lastName: candidate.lastName, displayName: candidate.displayName,
        email: candidate.email, phone: candidate.phone, gender: candidate.gender, dateOfBirth: candidate.dateOfBirth,
        quickNotes: candidate.quickNotes, createdAt: candidate.createdAt, updatedAt: candidate.updatedAt,
        applicationCount: sql<number>`count(${application.id})::int`,
      }).from(candidate)
        .leftJoin(application, and(eq(application.candidateId, candidate.id), eq(application.organizationId, orgId)))
        .where(where).groupBy(candidate.id).orderBy(desc(candidate.createdAt)).limit(query.limit).offset(offset)
    : db.select({
        id: candidate.id, firstName: candidate.firstName, lastName: candidate.lastName, displayName: candidate.displayName,
        email: candidate.email, phone: candidate.phone, gender: candidate.gender, dateOfBirth: candidate.dateOfBirth,
        quickNotes: candidate.quickNotes, createdAt: candidate.createdAt, updatedAt: candidate.updatedAt,
        applicationCount: sql<number>`count(${application.id}) filter (where ${recruitmentRequirementState.id} is not null)::int`,
      }).from(candidate)
        .leftJoin(application, and(eq(application.candidateId, candidate.id), eq(application.organizationId, orgId)))
        .leftJoin(recruitmentRequirementState, and(
          eq(recruitmentRequirementState.jobId, application.jobId),
          eq(recruitmentRequirementState.organizationId, orgId),
          eq(recruitmentRequirementState.ownerUserId, session.user.id),
        ))
        .where(where).groupBy(candidate.id).orderBy(desc(candidate.createdAt)).limit(query.limit).offset(offset)

  const [data, total] = await Promise.all([dataQuery, db.$count(candidate, where)])
  const ids = data.map(c => c.id)
  const propertyMap = await loadPropertyEntriesForEntities({ organizationId: orgId, entityType: 'candidate', entityIds: ids })
  const enriched = data.map(c => ({ ...c, properties: propertyMap.get(c.id) ?? [] }))
  return { data: enriched, total, page: query.page, limit: query.limit }
})