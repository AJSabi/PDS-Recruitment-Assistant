import { and, eq } from 'drizzle-orm'
import { application, job, jobSkillMatrix, recruiterScreeningSession, recruitmentApplicationProfile, recruitmentRequirementState, resumeAssessment } from '../../../../database/schema'
import { loadAiConfig } from '../../../../utils/ai/loadConfig'
import { interpretPdsScreening } from '../../../../utils/ai/pdsScreening'
import type { SupportedProvider } from '../../../../utils/ai/provider'
import { createRateLimiter } from '../../../../utils/rateLimit'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 10, message: 'Too many AI screening interpretation requests. Please wait before retrying.' })

export default defineEventHandler(async (event) => {
  await limiter(event)
  const session = await requirePermission(event, { application: ['update'], scoring: ['create'] })
  const orgId = session.session.activeOrganizationId
  const { id: applicationId } = await getValidatedRouterParams(event, paramsSchema.parse)

  const app = await db.query.application.findFirst({ where: and(eq(application.id, applicationId), eq(application.organizationId, orgId)), columns: { id: true, jobId: true } })
  if (!app) throw createError({ statusCode: 404, statusMessage: 'Application not found' })

  const [profile, requirementState, jobRecord, matrixRecord, assessment, screening] = await Promise.all([
    db.query.recruitmentApplicationProfile.findFirst({ where: and(eq(recruitmentApplicationProfile.applicationId, applicationId), eq(recruitmentApplicationProfile.organizationId, orgId)) }),
    db.query.recruitmentRequirementState.findFirst({ where: and(eq(recruitmentRequirementState.jobId, app.jobId), eq(recruitmentRequirementState.organizationId, orgId)) }),
    db.query.job.findFirst({ where: and(eq(job.id, app.jobId), eq(job.organizationId, orgId)), columns: { title: true, description: true } }),
    db.query.jobSkillMatrix.findFirst({ where: and(eq(jobSkillMatrix.jobId, app.jobId), eq(jobSkillMatrix.organizationId, orgId)) }),
    db.query.resumeAssessment.findFirst({ where: and(eq(resumeAssessment.applicationId, applicationId), eq(resumeAssessment.organizationId, orgId)) }),
    db.query.recruiterScreeningSession.findFirst({ where: and(eq(recruiterScreeningSession.applicationId, applicationId), eq(recruiterScreeningSession.organizationId, orgId)) }),
  ])

  if (!profile || !screening) throw createError({ statusCode: 404, statusMessage: 'Screening session not found' })
  if (screening.status !== 'in_progress') throw createError({ statusCode: 422, statusMessage: 'AI interpretation is available only for an in-progress screening.' })
  if ((screening.responses?.length ?? 0) !== (screening.questions?.length ?? 0) || !screening.questions?.length) throw createError({ statusCode: 422, statusMessage: 'Answer all recruiter screening questions before AI interpretation.' })
  if (!requirementState?.skillMatrixApproved || !matrixRecord?.approvedMatrix || !assessment || !jobRecord?.description) throw createError({ statusCode: 422, statusMessage: 'Approved Skill Matrix, Active JD and resume assessment are required.' })

  const config = await loadAiConfig(orgId, { purpose: 'analysis' })
  const suggestion = await interpretPdsScreening({
    provider: config.provider as SupportedProvider,
    model: config.model,
    apiKeyEncrypted: config.apiKeyEncrypted,
    baseUrl: config.baseUrl,
    maxTokens: config.maxTokens,
  }, {
    jobTitle: jobRecord.title,
    jobDescription: jobRecord.description,
    approvedMatrix: matrixRecord.approvedMatrix,
    resumeAssessment: assessment,
    questions: screening.questions,
    responses: screening.responses,
  })

  return { suggestion, source: 'ai', provider: config.provider, model: config.model }
})
