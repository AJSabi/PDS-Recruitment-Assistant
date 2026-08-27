import { and, desc, eq, isNull } from 'drizzle-orm'
import {
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
const FINAL_POOL_THRESHOLD = 50
const LIGHTWEIGHT_PREFILTER_THRESHOLD = 25
// Keep each user-triggered refresh short enough to stay inside the preview/proxy request window.
// Plausible candidates beyond this limit remain deferred for the next explicit refresh.
const MAX_FULL_AI_ANALYSES_PER_SYNC = 3

type MatrixSkill = { skill?: string; priority?: 'mandatory' | 'preferred' | 'optional' }
type MatrixClassification = { skills?: MatrixSkill[] }
type SkillMatrix = { classifications?: MatrixClassification[] }

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+#. ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function skillMentioned(resumeText: string, skill: string) {
  const haystack = normalize(resumeText)
  const needle = normalize(skill)
  if (!needle) return false
  if (haystack.includes(needle)) return true
  const words = needle.split(' ').filter(word => word.length >= 3)
  if (!words.length) return haystack.includes(needle)
  const hits = words.filter(word => haystack.includes(word)).length
  return hits >= Math.max(1, Math.ceil(words.length * 0.6))
}

function lightweightSkillMatch(matrix: unknown, resumeText: string) {
  const classifications = (matrix as SkillMatrix)?.classifications ?? []
  const skills = classifications.flatMap(c => c.skills ?? []).filter(s => s.skill?.trim())
  if (!skills.length) return 0
  const weight = (priority?: string) => priority === 'mandatory' ? 6 : priority === 'preferred' ? 2 : 1
  const total = skills.reduce((sum, skill) => sum + weight(skill.priority), 0)
  const matched = skills.reduce((sum, skill) => sum + (skillMentioned(resumeText, skill.skill ?? '') ? weight(skill.priority) : 0), 0)
  return total ? Math.round((matched / total) * 100) : 0
}

export default defineEventHandler(async (event) => {
  await limiter(event)
  const session = await requirePermission(event, { application: ['read'], scoring: ['create'] })
  const orgId = session.session.activeOrganizationId
  const { id: jobId } = await getValidatedRouterParams(event, paramsSchema.parse)
  await assertRequirementAccess(orgId, session.user.id, jobId)

  const [jobRecord, matrixRecord, requirementState] = await Promise.all([
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
  ])

  if (!jobRecord) throw createError({ statusCode: 404, statusMessage: 'Requirement not found' })
  if (!jobRecord.description) throw createError({ statusCode: 422, statusMessage: 'Save the Active JD before syncing the AI Candidate Pool.' })
  if (!matrixRecord?.approvedMatrix || !requirementState?.skillMatrixApproved) {
    throw createError({ statusCode: 422, statusMessage: 'Approve the Skill Matrix before syncing the AI Candidate Pool.' })
  }

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
  let skippedCurrent = 0
  let skippedPrefilter = 0
  let deferredForAiBudget = 0
  let aiAttempts = 0
  let analyzed = 0
  let visibleMatches = 0
  let belowThreshold = 0
  const failures: Array<{ candidateId: string; error: string }> = []

  for (const [candidateId, resume] of latestResumeByCandidate) {
    considered++
    const existing = await db.query.talentPoolMatch.findFirst({
      where: and(
        eq(talentPoolMatch.organizationId, orgId),
        eq(talentPoolMatch.jobId, jobId),
        eq(talentPoolMatch.candidateId, candidateId),
      ),
    })

    if (existing?.resumeDocumentId === resume.documentId && existing.requirementVersion === requirementVersion && existing.assessedAt) {
      skippedCurrent++
      if ((existing.score ?? 0) >= FINAL_POOL_THRESHOLD) visibleMatches++
      else belowThreshold++
      continue
    }

    const resumeText = extractResumeText(resume.parsedContent)
    if (!resumeText) continue

    const preMatch = lightweightSkillMatch(matrixRecord.approvedMatrix, resumeText)
    if (preMatch < LIGHTWEIGHT_PREFILTER_THRESHOLD) {
      skippedPrefilter++
      if (existing) await db.delete(talentPoolMatch).where(eq(talentPoolMatch.id, existing.id))
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
        await db.update(talentPoolMatch).set(values).where(eq(talentPoolMatch.id, existing.id))
      }
      else {
        await db.insert(talentPoolMatch).values({ ...values, source: 'database' })
      }

      if (ranking.score < FINAL_POOL_THRESHOLD) belowThreshold++
      else visibleMatches++
    }
    catch (error: any) {
      failures.push({ candidateId, error: error?.data?.statusMessage ?? error?.message ?? 'AI analysis failed' })
    }
  }

  return {
    jobId,
    threshold: FINAL_POOL_THRESHOLD,
    prefilterThreshold: LIGHTWEIGHT_PREFILTER_THRESHOLD,
    maxFullAiAnalysesPerSync: MAX_FULL_AI_ANALYSES_PER_SYNC,
    considered,
    analyzed,
    aiAttempts,
    visibleMatches,
    belowThreshold,
    skippedCurrent,
    skippedPrefilter,
    deferredForAiBudget,
    failures,
  }
})
