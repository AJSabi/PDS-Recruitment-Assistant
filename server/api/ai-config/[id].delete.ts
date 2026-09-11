import { and, eq, ne } from 'drizzle-orm'
import { z } from 'zod'
import { aiConfig } from '../../database/schema'
import { assertRecruitmentAdmin } from '../../utils/recruitmentVisibility'

const paramsSchema = z.object({ id: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { scoring: ['create'] })
  const orgId = session.session.activeOrganizationId
  await assertRecruitmentAdmin(orgId, session.user.id)
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)

  const existing = await db.query.aiConfig.findFirst({
    where: and(eq(aiConfig.id, id), eq(aiConfig.organizationId, orgId)),
    columns: { id: true, isDefaultChatbot: true, isDefaultAnalysis: true },
  })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'AI configuration not found.' })

  await db.transaction(async (tx) => {
    await tx.delete(aiConfig).where(and(eq(aiConfig.id, id), eq(aiConfig.organizationId, orgId)))

    if (existing.isDefaultChatbot || existing.isDefaultAnalysis) {
      const successor = await tx.query.aiConfig.findFirst({
        where: and(eq(aiConfig.organizationId, orgId), ne(aiConfig.id, id)),
        orderBy: (t, { desc }) => [desc(t.createdAt)],
        columns: { id: true },
      })
      if (successor) {
        const promote: Record<string, unknown> = { updatedAt: new Date() }
        if (existing.isDefaultChatbot) promote.isDefaultChatbot = true
        if (existing.isDefaultAnalysis) promote.isDefaultAnalysis = true
        await tx.update(aiConfig).set(promote).where(eq(aiConfig.id, successor.id))
      }
    }
  })

  recordActivity({ organizationId: orgId, actorId: session.user.id, action: 'deleted', resourceType: 'aiConfig', resourceId: id })
  return { success: true }
})
