import { eq, and, desc } from 'drizzle-orm'
import { activityLog, user } from '../../database/schema'
import { activityLogQuerySchema } from '../../utils/schemas/activityLog'
import { assertRecruitmentAdmin } from '../../utils/recruitmentVisibility'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { activityLog: ['read'] })
  const orgId = session.session.activeOrganizationId
  await assertRecruitmentAdmin(orgId, session.user.id)

  const query = await getValidatedQuery(event, activityLogQuerySchema.parse)
  const offset = (query.page - 1) * query.limit
  const conditions = [eq(activityLog.organizationId, orgId)]
  if (query.resourceType) conditions.push(eq(activityLog.resourceType, query.resourceType))
  if (query.resourceId) conditions.push(eq(activityLog.resourceId, query.resourceId))
  const where = and(...conditions)

  const [data, total] = await Promise.all([
    db.select({
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
    }).from(activityLog).innerJoin(user, eq(user.id, activityLog.actorId)).where(where).orderBy(desc(activityLog.createdAt)).limit(query.limit).offset(offset),
    db.$count(activityLog, where),
  ])

  return { data, total, page: query.page, limit: query.limit }
})
