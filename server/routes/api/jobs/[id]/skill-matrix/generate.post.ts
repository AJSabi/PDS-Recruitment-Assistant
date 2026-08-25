import { and, eq } from 'drizzle-orm'
import { job } from '../../../../../database/schema'
import { loadAiConfig } from '../../../../../utils/ai/loadConfig'
import { generateSkillMatrixFromDescription } from '../../../../../utils/ai/skillMatrix'
import type { SupportedProvider } from '../../../../../utils/ai/provider'
import { createRateLimiter } from '../../../../../utils/rateLimit'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 10, message: 'Too many Skill Matrix generation requests. Please wait before retrying.' })

export default defineEventHandler(async (event) => {
  await limiter(event)
  const session = await requirePermission(event, { scoring: ['create'] })
  const orgId = session.session.activeOrganizationId
  const { id: jobId } = await getValidatedRouterParams(event, paramsSchema.parse)

  const jobRecord = await db.query.job.findFirst({
    where: and(eq(job.id, jobId), eq(job.organizationId, orgId)),
    columns: { id: true, title: true, description: true },
  })
  if (!jobRecord) throw createError({ statusCode: 404, statusMessage: 'Requirement not found in the active organization.' })
  if (!jobRecord.description) throw createError({ statusCode: 422, statusMessage: 'Active JD is required before AI Skill Matrix generation.' })

  const config = await loadAiConfig(orgId, { purpose: 'analysis' })
  const matrix = await generateSkillMatrixFromDescription({
    provider: config.provider as SupportedProvider,
    model: config.model,
    apiKeyEncrypted: config.apiKeyEncrypted,
    baseUrl: config.baseUrl,
    maxTokens: config.maxTokens,
  }, jobRecord.title, jobRecord.description)

  return { matrix, source: 'ai' }
})
