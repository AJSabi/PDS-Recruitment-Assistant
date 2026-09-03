import { and, eq } from 'drizzle-orm'
import { aiConfig, job } from '../../../../database/schema'
import { generateJobDescription } from '../../../../utils/ai/jobDescription'
import type { SupportedProvider } from '../../../../utils/ai/provider'
import { createRateLimiter } from '../../../../utils/rateLimit'
import { assertRequirementAccess } from '../../../../utils/recruitmentVisibility'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })
const bodySchema = z.object({ currentDescription: z.string().max(12000).nullish() })
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 10, message: 'Too many JD generation requests. Please wait before retrying.' })

export default defineEventHandler(async (event) => {
  await limiter(event)
  const session = await requirePermission(event, { job: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { id: jobId } = await getValidatedRouterParams(event, paramsSchema.parse)
  await assertRequirementAccess(orgId, session.user.id, jobId)
  const body = await readValidatedBody(event, bodySchema.parse)

  const jobRecord = await db.query.job.findFirst({
    where: and(eq(job.id, jobId), eq(job.organizationId, orgId)),
    columns: { id: true, title: true, location: true, type: true, experienceLevel: true },
  })
  if (!jobRecord) throw createError({ statusCode: 404, statusMessage: 'Requirement not found' })

  const config = await db.query.aiConfig.findFirst({ where: eq(aiConfig.organizationId, orgId) })
  if (!config) throw createError({ statusCode: 422, statusMessage: 'AI provider not configured. Set up your AI provider in Settings first.' })

  const description = await generateJobDescription({
    provider: config.provider as SupportedProvider,
    model: config.model,
    apiKeyEncrypted: config.apiKeyEncrypted,
    baseUrl: config.baseUrl,
    maxTokens: config.maxTokens,
  }, {
    title: jobRecord.title,
    location: jobRecord.location,
    type: jobRecord.type,
    experienceLevel: jobRecord.experienceLevel,
    currentDescription: body.currentDescription,
  })

  return { description, source: 'ai' }
})