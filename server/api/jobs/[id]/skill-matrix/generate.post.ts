import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { job } from '../../../../database/schema'
import { generateSkillMatrixFromDescription } from '../../../../utils/ai/skillMatrix'
import { loadAiConfig } from '../../../../utils/ai/loadConfig'
import type { SupportedProvider } from '../../../../utils/ai/provider'
import { assertRequirementAccess } from '../../../../utils/recruitmentVisibility'

const paramsSchema = z.object({ id: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { scoring: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { id: jobId } = await getValidatedRouterParams(event, paramsSchema.parse)
  await assertRequirementAccess(orgId, session.user.id, jobId)

  const jobRecord = await db.query.job.findFirst({
    where: and(eq(job.id, jobId), eq(job.organizationId, orgId)),
    columns: {
      id: true,
      title: true,
      description: true,
    },
  })

  if (!jobRecord) {
    throw createError({ statusCode: 404, statusMessage: 'Requirement not found' })
  }

  const description = jobRecord.description?.trim()
  if (!description) {
    throw createError({ statusCode: 422, statusMessage: 'Save the Active JD before generating the AI Skill Matrix.' })
  }

  const config = await loadAiConfig(orgId, { purpose: 'analysis' })
  const matrix = await generateSkillMatrixFromDescription({
    provider: config.provider as SupportedProvider,
    model: config.model,
    apiKeyEncrypted: config.apiKeyEncrypted,
    baseUrl: config.baseUrl,
    maxTokens: config.maxTokens,
  }, jobRecord.title, description)

  return { matrix }
})
