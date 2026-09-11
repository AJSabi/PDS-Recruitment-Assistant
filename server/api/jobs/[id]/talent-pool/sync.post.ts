import { and, desc, eq, isNull } from 'drizzle-orm'
import {
  application,
  candidate,
  document,
  job,
  jobSkillMatrix,
  recruitmentRequirementState,
  talentPoolMatch,
} from '../../../../database/schema'
import { loadAiConfig } from '../../../../utils/ai/loadConfig'
import { generatePdsResumeAssessment } from '../../../../utils/ai/pdsResumeAssessment'
import type { SupportedProvider } from '../../../../utils/ai/provider'
import { calculateProvisionalFit } from '../../../../utils/recruitmentScoring'
import { assertRequirementAccess } from '../../../../utils/recruitmentVisibility'
import { extractResumeText } from '../../../../utils/resume-parser'
import { createRateLimiter } from '../../../../utils/rateLimit'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 4, message: 'Talent pool sync is already running too frequently. Please wait before retrying.' })
// Keep each user-triggered refresh short enough to stay inside the preview/proxy request window.
// Candidates beyond this limit remain deferred for the next explicit refresh; none are excluded by score.
const MAX_FULL_AI_ANALYSES_PER_SYNC = 3

export default defineEventHandler(async (event) => {
  await limiter(event)
  const session = await requirePermission(event, { application: ['read'], scoring: ['create'] })
  const orgId = session.session.activeOrganizationId
  const { id: jobId } = await getValidatedRouterParams(event, paramsSchema.parse)
  await assertRequirementAccess(orgId, session.user.id, jobId)

  const [jobRecord, matrixRecord, requirementState, existingApplications] = await Promise.all([
    db.query.job.findFirst({
      where: and(eq(job.id, jobId), eq(job.organizationId, orgId)),
      columns: { id: true, title: true, description: true },
    }),
    db.query.jobSkillMatrix.findFirst({
      where: and(eq(jobSkillMatrix.jobId, jobId), eq(jobSkillMatrix.organizationId, orgId)),
    }),
    db.query.recruitmentRequirementState.findFirst({
      where: and(eq(recruitmentRequirementState.jobId, jobId), eq(recruitmentRequirementState.organizationId, orgId)),
    }),
    db.select({ candidateId: application.candidateId }).from(application).where(and(
      eq(application.organizationId, orgId),
      eq(application.jobId, jobId),
    )),
  ])

  if (!jobRecord) throw createError({ statusCode: 404, statusMessage: 'Requirement not found' })
  if (!jobRecord.description) throw createError({ statusCode: 422, statusMessage: 'Save the Active JD before syncing the AI Candidate Pool.' })
  if (!matrixRecord?.approvedMatrix || !requirementState?.skillMatrixApproved) {
    throw createError({ statusCode: 422, statusMessage: 'Approve the Skill Matrix before syncing the AI Candidate Pool.' })
  }

  const existingApplicationCandidateIds = new Set(existingApplications.map(row => row.candidateId))
  const resumeRows = await db.select({
    candidateId: candidate.id,
    documentId: document.id,
    parsedContent: document.parsedContent,
    createdAt: document.createdAt,
  }).from(document)
    .innerJoin(candidate, eq(candidate.id, document.candidateId))
    .where(and(
      eq(document.organizationId, orgId),
      eq(candidate.organizationId, orgId),
      eq(document.type, 'resume'),
      isNull(candidate.quarantinedAt),
    ))
    .orderBy(desc(document.createdAt))

  const latestResumeByCandidate = new Map<string, typeof resumeRows[number]>()
  for (const row of resumeRows) {
    if (!latestResumeByCandidate.has(row.candidateId) && extractResumeText(row.parsedContent)) {
      latestResumeByCandidate.set(row.candidateId, row)
    }
  }

  const config = await loadAiConfig(orgId, { purpose: 'analysis' })
  const providerConfig = {
    provider: config.provider as SupportedProvider,
    model: config.model,
    apiKeyEncrypted: config.apiKeyEncrypted,
    baseUrl: config.baseUrl,
    maxTokens: config.maxTokens,
  }

  const requirementVersion = requirementState.revision
  let considered = 0
  let skippedExistingApplication = 0
  let skippedCurrent = 0
  let deferredForAiBudget = 0
  let aiAttempts = 0
  let analyzed = 0
  let assessedMatches = 0
  const failures: Array<{ candidateId: string; error: string }> = []

  for (const [candidateId, resume] of latestResumeByCandidate) {
    considered++
    if (existingApplicationCandidateIds.has(candidateId)) {
      skippedExistingApplication++
      continue
    }

    const existing = await db.query.talentPoolMatch.findFirst({
      where: and(
        eq(talentPoolMatch.organizationId, orgId),
        eq(talentPoolMatch.jobId, jobId),
        eq(talentPoolMatch.candidateId, candidateId),
      ),
    })

    if (existing?.resumeDocumentId === resume.documentId && existing.requirementVersion === requirementVersion && existing.assessedAt) {
      skippedCurrent++
      assessedMatches++
      continue
    }

    if (aiAttempts >= MAX_FULL_AI_ANALYSES_PER_SYNC) {
      deferredForAiBudget++
      continue
    }

    aiAttempts++
    try {
      const generated = await generatePdsResumeAssessment(providerConfig, {
        jobTitle: jobRecord.title,
        jobDescription: jobRecord.description,
        skillMatrix: matrixRecord.approvedMatrix,
        resumeContent: resume.parsedContent,
      })
      const ranking = calculateProvisionalFit({
        mandatoryScore: generated.mandatoryScore,
        preferredScore: generated.preferredScore,
        experienceScore: generated.experienceScore,
        optionalScore: generated.optionalScore,
      })
      analyzed++
      assessedMatches++

      const now = new Date()
      const values = {
        organizationId: orgId,
        jobId,
        candidateId,
        resumeDocumentId: resume.documentId,
        requirementVersion,
        mandatoryScore: generated.mandatoryScore,
        preferredScore: generated.preferredScore,
        experienceScore: generated.experienceScore,
        optionalScore: generated.optionalScore,
        score: ranking.score,
        priority: ranking.priority,
        mandatoryMatch: generated.mandatoryMatch,
        keyStrength: generated.keyStrength,
        mainGap: generated.mainGap,
        candidateSnapshot: generated.candidateSnapshot,
        jdAlignment: generated.jdAlignment,
        skillAssessment: generated.skillAssessment,
        keyGaps: generated.keyGaps,
        verificationAreas: generated.verificationAreas,
        assessedAt: now,
        updatedAt: now,
      }

      if (existing) {
        await db.update(talentPoolMatch).set(values).where(and(
          eq(talentPoolMatch.id, existing.id),
          eq(talentPoolMatch.organizationId, orgId),
        ))
      }
      else {
        await db.insert(talentPoolMatch).values({ ...values, source: 'database' })
      }
    }
    catch (error: any) {
      failures.push({ candidateId, error: error?.data?.statusMessage ?? error?.message ?? 'AI analysis failed' })
    }
  }

  return {
    jobId,
    threshold: null,
    prefilterThreshold: null,
    maxFullAiAnalysesPerSync: MAX_FULL_AI_ANALYSES_PER_SYNC,
    considered,
    analyzed,
    aiAttempts,
    assessedMatches,
    // Compatibility aliases for the existing UI/client contract. They no longer represent a score threshold.
    visibleMatches: assessedMatches,
    belowThreshold: 0,
    skippedExistingApplication,
    skippedCurrent,
    skippedPrefilter: 0,
    deferredForAiBudget,
    advisoryOnly: true,
    note: 'No candidate is excluded or hidden by an AI or keyword score. Batch limits only defer analysis to a later explicit refresh.',
    failures,
  }
})