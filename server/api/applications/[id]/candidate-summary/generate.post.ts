import { and, asc, eq } from 'drizzle-orm'
import {
  job,
  recruiterScreeningSession,
  recruitmentApplicationProfile,
  recruitmentEvidence,
  resumeAssessment,
} from '../../../../database/schema'
import { generatePdsCandidateSummary } from '../../../../utils/ai/pdsCandidateSummary'
import { loadAiConfig } from '../../../../utils/ai/loadConfig'
import type { SupportedProvider } from '../../../../utils/ai/provider'
import { createRateLimiter } from '../../../../utils/rateLimit'
import { assertApplicationAccess } from '../../../../utils/recruitmentVisibility'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 6, message: 'Too many AI candidate summary requests. Please wait before retrying.' })

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['update'], scoring: ['create'] })
  const orgId = session.session.activeOrganizationId
  const { id: applicationId } = await getValidatedRouterParams(event, paramsSchema.parse)
  const app = await assertApplicationAccess(orgId, session.user.id, applicationId)
  await limiter(event)

  const [profile, jobRecord, assessment, screening, evidence] = await Promise.all([
    db.query.recruitmentApplicationProfile.findFirst({
      where: and(eq(recruitmentApplicationProfile.organizationId, orgId), eq(recruitmentApplicationProfile.applicationId, applicationId)),
    }),
    db.query.job.findFirst({
      where: and(eq(job.organizationId, orgId), eq(job.id, app.jobId)),
      columns: { title: true, description: true },
    }),
    db.query.resumeAssessment.findFirst({
      where: and(eq(resumeAssessment.organizationId, orgId), eq(resumeAssessment.applicationId, applicationId)),
    }),
    db.query.recruiterScreeningSession.findFirst({
      where: and(eq(recruiterScreeningSession.organizationId, orgId), eq(recruiterScreeningSession.applicationId, applicationId)),
    }),
    db.select({
      type: recruitmentEvidence.type,
      summary: recruitmentEvidence.summary,
      payload: recruitmentEvidence.payload,
      createdAt: recruitmentEvidence.createdAt,
    }).from(recruitmentEvidence)
      .where(and(eq(recruitmentEvidence.organizationId, orgId), eq(recruitmentEvidence.applicationId, applicationId)))
      .orderBy(asc(recruitmentEvidence.createdAt)),
  ])

  if (!profile) throw createError({ statusCode: 404, statusMessage: 'Recruitment profile not found' })
  if (!jobRecord) throw createError({ statusCode: 404, statusMessage: 'Requirement not found' })
  if (!assessment && !screening && !evidence.length) {
    throw createError({ statusCode: 422, statusMessage: 'No assessment or recruitment evidence is available to summarize yet.' })
  }

  const config = await loadAiConfig(orgId, { purpose: 'analysis' })
  const generated = await generatePdsCandidateSummary({
    provider: config.provider as SupportedProvider,
    model: config.model,
    apiKeyEncrypted: config.apiKeyEncrypted,
    baseUrl: config.baseUrl,
    maxTokens: config.maxTokens,
  }, {
    jobTitle: jobRecord.title,
    jobDescription: jobRecord.description,
    currentStatus: profile.lastStatus,
    currentFit: profile.currentFit,
    score: profile.provisionalFitScore,
    priority: profile.priority,
    mandatoryMatch: profile.mandatoryMatch,
    keyStrength: profile.keyStrength,
    mainGap: profile.mainGap,
    resumeAssessment: assessment,
    screening,
    evidence,
  })

  const now = new Date()
  const [updated] = await db.update(recruitmentApplicationProfile).set({
    aiCandidateSummary: generated.candidateSummary,
    aiOverallAssessment: generated.overallAssessment,
    aiInterviewBriefs: generated.interviewBriefs,
    aiFinalBrief: generated.finalBrief,
    aiEvidenceConfidence: generated.evidenceConfidence,
    aiSummaryStale: false,
    aiSummaryUpdatedAt: now,
    lastUpdatedBy: session.user.id,
    updatedAt: now,
  }).where(eq(recruitmentApplicationProfile.id, profile.id)).returning()

  return {
    finalStatus: updated?.lastStatus ?? profile.lastStatus,
    currentFit: updated?.currentFit ?? profile.currentFit,
    candidateSummary: generated.candidateSummary,
    overallAssessment: generated.overallAssessment,
    interviewBriefs: generated.interviewBriefs,
    finalBrief: generated.finalBrief,
    evidenceConfidence: generated.evidenceConfidence,
    stale: false,
    generated: true,
    updatedAt: now,
  }
})