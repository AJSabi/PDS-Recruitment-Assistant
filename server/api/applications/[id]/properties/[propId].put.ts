import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { propertyDefinition, propertyValue } from '../../../../database/schema'
import {
  setPropertyValueSchema,
  validateValueForType,
  type PropertyType,
} from '../../../../utils/schemas/property'
import { assertApplicationAccess } from '../../../../utils/recruitmentVisibility'

const paramsSchema = z.object({ id: z.string().min(1), propId: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['update'] })
  const orgId = session.session.activeOrganizationId

  const { id, propId } = await getValidatedRouterParams(event, paramsSchema.parse)
  const app = await assertApplicationAccess(orgId, session.user.id, id)
  const { value } = await readValidatedBody(event, setPropertyValueSchema.parse)

  const def = await db.query.propertyDefinition.findFirst({
    where: and(eq(propertyDefinition.id, propId), eq(propertyDefinition.organizationId, orgId)),
  })
  if (!def) throw createError({ statusCode: 404, statusMessage: 'Property not found' })
  if (def.entityType !== 'application') throw createError({ statusCode: 422, statusMessage: 'Property is not an application property' })
  if (def.jobId && def.jobId !== app.jobId) throw createError({ statusCode: 422, statusMessage: 'Property is scoped to a different job' })

  const normalized = validateValueForType(def.type as PropertyType, value, def.config)

  if (normalized === null) {
    await db.delete(propertyValue).where(and(
      eq(propertyValue.organizationId, orgId),
      eq(propertyValue.propertyDefinitionId, propId),
      eq(propertyValue.entityId, id),
      eq(propertyValue.entityType, 'application'),
    ))
    return { value: null }
  }

  const [row] = await db.insert(propertyValue).values({
    organizationId: orgId,
    propertyDefinitionId: propId,
    entityType: 'application',
    entityId: id,
    value: normalized as never,
  }).onConflictDoUpdate({
    target: [propertyValue.propertyDefinitionId, propertyValue.entityId],
    set: { value: normalized as never, updatedAt: new Date() },
  }).returning({ value: propertyValue.value })

  return { value: row?.value ?? normalized }
})
