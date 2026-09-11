import { eq } from 'drizzle-orm'
import { aiConfig } from '../../database/schema'
import { createAiConfigSchema } from '../../utils/schemas/scoring'
import { encrypt } from '../../utils/encryption'
import { assertRecruitmentAdmin } from '../../utils/recruitmentVisibility'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { scoring: ['create'] })
  const orgId = session.session.activeOrganizationId
  await assertRecruitmentAdmin(orgId, session.user.id)
  const body = await readValidatedBody(event, createAiConfigSchema.parse)

  const apiKeyEncrypted = encrypt(body.apiKey, env.BETTER_AUTH_SECRET)
  const existingCount = await db.$count(aiConfig, eq(aiConfig.organizationId, orgId))
  const isFirst = existingCount === 0
  const isDefaultChatbot = isFirst || body.isDefaultChatbot === true
  const isDefaultAnalysis = isFirst || body.isDefaultAnalysis === true

  const created = await db.transaction(async (tx) => {
    if (isDefaultChatbot) await tx.update(aiConfig).set({ isDefaultChatbot: false }).where(eq(aiConfig.organizationId, orgId))
    if (isDefaultAnalysis) await tx.update(aiConfig).set({ isDefaultAnalysis: false }).where(eq(aiConfig.organizationId, orgId))

    const [row] = await tx.insert(aiConfig).values({
      organizationId: orgId,
      name: body.name,
      provider: body.provider,
      model: body.model,
      apiKeyEncrypted,
      baseUrl: body.baseUrl ?? null,
      maxTokens: body.maxTokens,
      inputPricePer1m: body.inputPricePer1m != null ? String(body.inputPricePer1m) : null,
      outputPricePer1m: body.outputPricePer1m != null ? String(body.outputPricePer1m) : null,
      isDefaultChatbot,
      isDefaultAnalysis,
    }).returning({
      id: aiConfig.id,
      name: aiConfig.name,
      provider: aiConfig.provider,
      model: aiConfig.model,
      baseUrl: aiConfig.baseUrl,
      maxTokens: aiConfig.maxTokens,
      isDefaultChatbot: aiConfig.isDefaultChatbot,
      isDefaultAnalysis: aiConfig.isDefaultAnalysis,
    })
    return row!
  })

  recordActivity({ organizationId: orgId, actorId: session.user.id, action: 'created', resourceType: 'aiConfig', resourceId: created.id })
  setResponseStatus(event, 201)
  return { config: { ...created, hasApiKey: true } }
})
