import { and, eq } from 'drizzle-orm'
import {
  document,
  job,
  jobSkillMatrix,
  recruitmentApplicationProfile,
  recruitmentEvidence,
  recruitmentRequirementState,
  resumeAssessment,
} from '../../../../database/schema'
import { loadAiConfig } from '../../../../utils/ai/loadConfig'
import { generatePdsResumeAssessment } from '../../../../utils/ai/pdsResumeAssessment'
import type { SupportedProvider } from '../../../../utils/ai/provider'
import { calculateProvisionalFit } from '../../../../utils/recruitmentScoring'
import { refreshRequirementReassessmentFlag } from '../../../../utils/recruitmentLifecycle'
import { createRateLimiter } from '../../../../utils/rateLimit'
import { assertApplicationAccess } from '../../../../utils/recruitmentVisibility'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 10, message: 'Too many AI resume analysis requests. Please wait before retrying.' })
const allowedStatuses = new Set(['resume_received', 'resume_reviewed', 'reassess'])

export default defineEventHandler(async (event) => {
  await limiter(event)
  const session = await requirePermission(event, { application: ['update'], scoring: ['create'] })
  const orgId = session.session.activeOrganizationId
  const { id: applicationId } = await getValidatedRouterParams(event, paramsSchema.parse)
  const app = await assertApplicationAccess(orgId, session.user.id, applicationId)

  const [profile, requirementState, jobRecord, matrixRecord] = await Promise.all([
    db.query.recruitmentApplicationProfile.findFirst({ where: and(eq(recruitmentApplicationProfile.applicationId, applicationId), eq(recruitmentApplicationProfile.organizationId, orgId)) }),
    db.query.recruitmentRequirementState.findFirst({ where: and(eq(recruitmentRequirementState.jobId, app.jobId), eq(recruitmentRequirementState.organizationId, orgId)) }),
    db.query.job.findFirst({ where: and(eq(job.id, app.jobId), eq(job.organizationId, orgId)), columns: { id: true, title: true, description: true } }),
    db.query.jobSkillMatrix.findFirst({ where: and(eq(jobSkillMatrix.jobId, app.jobId), eq(jobSkillMatrix.organizationId, orgId)) }),
  ])

  if (!profile) throw createError({ statusCode: 404, statusMessage: 'Recruitment profile not found' })
  if (!profile.selectedResumeDocumentId) throw createError({ statusCode: 422, statusMessage: 'Select the resume for this application before AI analysis.' })
  if (!allowedStatuses.has(profile.lastStatus)) throw createError({ statusCode: 422, statusMessage: `AI resume analysis is not allowed while candidate status is ${profile.lastStatus}.` })
  // The persisted approved Skill Matrix is the source of truth. Requirement-state approval
  // is workflow metadata and historical drift there must not invalidate a real approval.
  if (!matrixRecord?.approvedAt || !matrixRecord?.approvedMatrix) throw createError({ statusCode: 422, statusMessage: 'Approve the Skill Matrix before AI candidate analysis.' })
  if (!jobRecord?.description) throw createError({ statusCode: 422, statusMessage: 'Active JD is required before AI candidate analysis.' })
  if (!requirementState) throw createError({ statusCode: 422, statusMessage: 'Requirement workflow state is missing.' })

  const resume = await db.query.document.findFirst({
    where: and(eq(document.id, profile.selectedResumeDocumentId), eq(document.organizationId, orgId), eq(document.candidateId, app.candidateId)),
    columns: { id: true, originalFilename: true, parsedContent: true },
  })
  if (!resume) throw createError({ statusCode: 404, statusMessage: 'Selected resume could not be found.' })
  if (!resume.parsedContent) throw createError({ statusCode: 422, statusMessage: 'The selected resume has no parsed text yet. Re-upload or reprocess the resume before AI analysis.' })

  const config = await loadAiConfig(orgId, { purpose: 'analysis' })
  const providerConfig = { provider: config.provider as SupportedProvider, model: config.model, apiKeyEncrypted: config.apiKeyEncrypted, baseUrl: config.baseUrl, maxTokens: config.maxTokens }
  const generated = await generatePdsResumeAssessment(providerConfig, { jobTitle: jobRecord.title, jobDescription: jobRecord.description, skillMatrix: matrixRecord.approvedMatrix, resumeContent: resume.parsedContent })
  const ranking = calculateProvisionalFit({ mandatoryScore: generated.mandatoryScore, preferredScore: generated.preferredScore, experienceScore: generated.experienceScore, optionalScore: generated.optionalScore })
  const now = new Date()
  const requirementRevision = requirementState.revision

  const existing = await db.query.resumeAssessment.findFirst({ where: and(eq(resumeAssessment.applicationId, applicationId), eq(resumeAssessment.organizationId, orgId)), columns: { id: true } })
  const values = {
    organizationId: orgId, applicationId, candidateSnapshot: generated.candidateSnapshot, jdAlignment: generated.jdAlignment, skillAssessment: generated.skillAssessment, keyGaps: generated.keyGaps, verificationAreas: generated.verificationAreas,
    mandatoryScore: generated.mandatoryScore, preferredScore: generated.preferredScore, experienceScore: generated.experienceScore, optionalScore: generated.optionalScore, provisionalFitScore: ranking.score, mandatoryMatch: generated.mandatoryMatch,
    keyStrength: generated.keyStrength, mainGap: generated.mainGap, priority: ranking.priority, requirementVersion: requirementRevision, source: 'ai' as const, assessedBy: session.user.id, assessedAt: now, updatedAt: now,
  }
  const [assessment] = existing ? await db.update(resumeAssessment).set(values).where(eq(resumeAssessment.id, existing.id)).returning() : await db.insert(resumeAssessment).values(values).returning()

  // Resume assessment and recruiter-call preparation are intentionally separate AI actions.
  // This endpoint never creates or replaces screening questions. Questions are generated only
  // from the explicit Prepare Questions with AI action in screening/generate.post.ts.
  const remainsInReassess = profile.lastStatus === 'reassess'
  await db.update(recruitmentApplicationProfile).set({
    lastStatus: remainsInReassess ? 'reassess' : 'resume_reviewed',
    statusDate: now,
    resumeBrief: generated.candidateSnapshot,
    provisionalFitScore: ranking.score,
    priority: ranking.priority,
    mandatoryMatch: generated.mandatoryMatch,
    keyStrength: generated.keyStrength,
    mainGap: generated.mainGap,
    aiCandidateSummary: generated.candidateSnapshot,
    aiOverallAssessment: generated.jdAlignment,
    aiInterviewBriefs: [],
    aiFinalBrief: null,
    aiEvidenceConfidence: 'limited',
    aiSummaryStale: remainsInReassess,
    aiSummaryUpdatedAt: now,
    requirementVersionAssessed: requirementRevision,
    nextAction: remainsInReassess ? 'Revalidate recruiter screening' : 'Review AI assessment and prepare recruiter screening',
    lastUpdatedBy: session.user.id,
    updatedAt: now,
  }).where(eq(recruitmentApplicationProfile.id, profile.id))
  await db.insert(recruitmentEvidence).values({ organizationId: orgId, applicationId, type: 'resume', summary: generated.candidateSnapshot, payload: { event: 'resume_assessed', selectedResumeDocumentId: resume.id, selectedResumeFilename: resume.originalFilename, provisionalFitScore: ranking.score, priority: ranking.priority, mandatoryMatch: generated.mandatoryMatch, requirementRevision, screeningQuestionsGenerated: 0, source: 'ai', provider: config.provider, model: config.model }, createdBy: session.user.id })
  await refreshRequirementReassessmentFlag(orgId, app.jobId)

  return { assessment, questions: [], ranking: { provisionalFitScore: ranking.score, priority: ranking.priority }, currentFit: profile.currentFit, requirementRevision, source: 'ai', screeningQuestionsGenerated: 0 }
})
