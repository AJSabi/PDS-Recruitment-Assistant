import { z } from 'zod'
import { generateCriteriaFromDescription } from '../../utils/ai/scoring'
import type { SupportedProvider } from '../../utils/ai/provider'
import { loadAiConfig } from '../../utils/ai/loadConfig'
import { createRateLimiter } from '../../utils/rateLimit'
import { assertRecruitmentAdmin } from '../../utils/recruitmentVisibility'

const bodySchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(50000),
  aiConfigId: z.string().min(1).nullable().optional(),
})

const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 10, message: 'Too many AI criteria generation requests. Please wait before retrying.' })

export default defineEventHandler(async (event) => {
  await limiter(event)
  const session = await requirePermission(event, { scoring: ['create'] })
  const orgId = session.session.activeOrganizationId
  await assertRecruitmentAdmin(orgId, session.user.id)
  const body = await readValidatedBody(event, bodySchema.parse)

  const config = await loadAiConfig(orgId, { purpose: 'analysis', preferId: body.aiConfigId })
  const criteria = await generateCriteriaFromDescription(
    { provider: config.provider as SupportedProvider, model: config.model, apiKeyEncrypted: config.apiKeyEncrypted, baseUrl: config.baseUrl, maxTokens: config.maxTokens },
    body.title,
    body.description,
  )

  return { criteria, source: 'ai' }
})
