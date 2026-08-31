import { and, eq } from 'drizzle-orm'
import { job, jobSkillMatrix } from '../../../../database/schema'
import { generatePdsSourcingToolkit } from '../../../../utils/ai/pdsSourcingToolkit'
import { loadAiConfig } from '../../../../utils/ai/loadConfig'
import type { SupportedProvider } from '../../../../utils/ai/provider'
import { assertRequirementAccess } from '../../../../utils/recruitmentVisibility'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })
const bodySchema = z.object({ recruiterFeedback: z.string().trim().max(1200).optional().default('') })

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { scoring: ['create'] })
  const orgId = session.session.activeOrganizationId
  const { id: jobId } = await getValidatedRouterParams(event, paramsSchema.parse)
  await assertRequirementAccess(orgId, session.user.id, jobId)
  const body = await readValidatedBody(event, bodySchema.parse)

  const [jobRecord, matrixRecord] = await Promise.all([
    db.query.job.findFirst({
      where: and(eq(job.id, jobId), eq(job.organizationId, orgId)),
      columns: { id: true, title: true, description: true },
    }),
    db.query.jobSkillMatrix.findFirst({
      where: and(eq(jobSkillMatrix.jobId, jobId), eq(jobSkillMatrix.organizationId, orgId)),
    }),
  ])

  if (!jobRecord) throw createError({ statusCode: 404, statusMessage: 'Requirement not found' })
  if (!jobRecord.description?.trim()) throw createError({ statusCode: 422, statusMessage: 'Save the Active JD before generating sourcing aids.' })
  if (!matrixRecord) throw createError({ statusCode: 422, statusMessage: 'Save or generate the Skill Matrix before generating sourcing aids.' })

  const config = await loadAiConfig(orgId, { purpose: 'analysis' })
  const generated = await generatePdsSourcingToolkit({
    provider: config.provider as SupportedProvider,
    model: config.model,
    apiKeyEncrypted: config.apiKeyEncrypted,
    baseUrl: config.baseUrl,
    maxTokens: config.maxTokens,
  }, {
    jobTitle: jobRecord.title,
    jobDescription: jobRecord.description,
    approvedMatrix: matrixRecord.approvedMatrix ?? matrixRecord.matrix,
    recruiterFeedback: body.recruiterFeedback || null,
    currentBooleanSearch: matrixRecord.booleanSearch,
  })

  const now = new Date()
  await db.update(jobSkillMatrix).set({
    majorSkills: generated.majorSkills,
    booleanSearch: generated.booleanSearch,
    booleanSearchFeedback: body.recruiterFeedback || null,
    sourcingGeneratedAt: now,
    sourcingUpdatedBy: session.user.id,
    updatedAt: now,
  }).where(eq(jobSkillMatrix.id, matrixRecord.id))

  return {
    ...generated,
    recruiterFeedback: body.recruiterFeedback,
    generatedAt: now,
    source: 'ai',
    provider: config.provider,
    model: config.model,
  }
})
