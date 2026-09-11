import { and, eq } from 'drizzle-orm'
import { job, jobSkillMatrix, recruiterScreeningSession, recruitmentApplicationProfile, resumeAssessment } from '../../../../database/schema'
import { loadAiConfig } from '../../../../utils/ai/loadConfig'
import { generatePdsScreeningQuestions } from '../../../../utils/ai/pdsScreening'
import type { SupportedProvider } from '../../../../utils/ai/provider'
import { createRateLimiter } from '../../../../utils/rateLimit'
import { assertApplicationAccess } from '../../../../utils/recruitmentVisibility'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 10, message: 'Too many AI screening generation requests. Please wait before retrying.' })

export default defineEventHandler(async (event) => {
  await limiter(event)
  const session = await requirePermission(event, { application: ['update'], scoring: ['create'] })
  const orgId = session.session.activeOrganizationId
  const { id: applicationId } = await getValidatedRouterParams(event, paramsSchema.parse)
  const app = await assertApplicationAccess(orgId, session.user.id, applicationId)

  const [profile, jobRecord, matrixRecord, assessment, existing] = await Promise.all([
    db.query.recruitmentApplicationProfile.findFirst({ where: and(eq(recruitmentApplicationProfile.applicationId, applicationId), eq(recruitmentApplicationProfile.organizationId, orgId)) }),
    db.query.job.findFirst({ where: and(eq(job.id, app.jobId), eq(job.organizationId, orgId)), columns: { title: true, description: true } }),
    db.query.jobSkillMatrix.findFirst({ where: and(eq(jobSkillMatrix.jobId, app.jobId), eq(jobSkillMatrix.organizationId, orgId)) }),
    db.query.resumeAssessment.findFirst({ where: and(eq(resumeAssessment.applicationId, applicationId), eq(resumeAssessment.organizationId, orgId)) }),
    db.query.recruiterScreeningSession.findFirst({ where: and(eq(recruiterScreeningSession.applicationId, applicationId), eq(recruiterScreeningSession.organizationId, orgId)) }),
  ])

  if (!profile) throw createError({ statusCode: 404, statusMessage: 'Recruitment profile not found' })

  const historicalReassess = existing?.status === 'completed'
    && existing.recommendedNextStep === 'reassess'
    && ['resume_reviewed', 'recruiter_screening_pending', 'recruiter_screening_completed'].includes(profile.lastStatus)
  const effectiveStatus = historicalReassess ? 'reassess' : profile.lastStatus

  if (!['resume_reviewed', 'reassess', 'recruiter_screening_pending'].includes(effectiveStatus)) throw createError({ statusCode: 422, statusMessage: 'Complete resume assessment before generating recruiter screening questions.' })
  if (existing?.status === 'in_progress') throw createError({ statusCode: 409, statusMessage: 'Screening is already in progress. Finish or reassess before regenerating questions.' })
  if (existing?.status === 'completed' && effectiveStatus !== 'reassess') throw createError({ statusCode: 409, statusMessage: 'Screening is already completed. Confirm Reassess before regenerating questions.' })
  // job_skill_matrix is the canonical approval record. recruitment_requirement_state mirrors
  // workflow metadata and must not block a genuinely approved matrix if historical data drifted.
  if (!matrixRecord?.approvedAt || !matrixRecord?.approvedMatrix) throw createError({ statusCode: 422, statusMessage: 'Approve the Skill Matrix before generating screening questions.' })
  if (!assessment) throw createError({ statusCode: 422, statusMessage: 'Resume assessment is required before generating screening questions.' })
  if (!jobRecord?.description) throw createError({ statusCode: 422, statusMessage: 'Active JD is required.' })

  const config = await loadAiConfig(orgId, { purpose: 'analysis' })
  const questions = await generatePdsScreeningQuestions({
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
  })

  // Repair only on an explicit successful revalidation action. This keeps GET endpoints
  // side-effect free while allowing historical completed sessions to re-enter the
  // governed Reassess flow without losing their prior screening evidence.
  if (historicalReassess) {
    const now = new Date()
    await db.update(recruitmentApplicationProfile).set({
      lastStatus: 'reassess',
      statusDate: now,
      nextAction: 'Revalidate recruiter screening',
      aiSummaryStale: true,
      lastUpdatedBy: session.user.id,
      updatedAt: now,
    }).where(eq(recruitmentApplicationProfile.id, profile.id))
  }

  // In Reassess, keep the completed session untouched until Start Revalidation Call.
  // start.post.ts snapshots the prior questions/responses/finalFit before replacing them.
  if (existing?.status === 'completed' && effectiveStatus === 'reassess') {
    return { questions, source: 'ai', provider: config.provider, model: config.model, reassessment: true, priorScreeningPreserved: true, historicalStageRecovered: historicalReassess }
  }

  const now = new Date()
  if (existing) {
    await db.update(recruiterScreeningSession).set({ questions, responses: [], status: 'not_started', finalFit: null, recommendedNextStep: null, validationFocus: [], startedAt: null, completedAt: null, updatedAt: now }).where(eq(recruiterScreeningSession.id, existing.id))
  } else {
    await db.insert(recruiterScreeningSession).values({ organizationId: orgId, applicationId, status: 'not_started', questions, responses: [], validationFocus: [] })
  }

  return { questions, source: 'ai', provider: config.provider, model: config.model }
})
