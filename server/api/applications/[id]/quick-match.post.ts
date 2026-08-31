import { and, desc, eq } from 'drizzle-orm'
import {
  document,
  job,
  jobSkillMatrix,
  recruitmentApplicationProfile,
  recruitmentEvidence,
  recruitmentRequirementState,
  resumeAssessment,
  talentPoolMatch,
} from '../../../database/schema'
import { loadAiConfig } from '../../../utils/ai/loadConfig'
import { generatePdsResumeAssessment } from '../../../utils/ai/pdsResumeAssessment'
import type { SupportedProvider } from '../../../utils/ai/provider'
import { syncApplicationStatusForRecruitmentStage } from '../../../utils/recruitmentApplicationStatus'
import { calculateProvisionalFit } from '../../../utils/recruitmentScoring'
import { assertApplicationAccess } from '../../../utils/recruitmentVisibility'
import { createRateLimiter } from '../../../utils/rateLimit'
import { extractResumeText } from '../../../utils/resume-parser'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 10, message: 'Too many AI candidate match requests. Please wait before retrying.' })
const allowedNewAssessmentStatuses = new Set(['candidate_added', 'resume_received', 'reassess'])

export default defineEventHandler(async (event) => {
  await limiter(event)
  const session = await requirePermission(event, { application: ['update'], scoring: ['create'], document: ['read'] })
  const orgId = session.session.activeOrganizationId
  const { id: applicationId } = await getValidatedRouterParams(event, paramsSchema.parse)
  const app = await assertApplicationAccess(orgId, session.user.id, applicationId)

  const [profile, requirementState, jobRecord, matrixRecord, resumeCandidates] = await Promise.all([
    db.query.recruitmentApplicationProfile.findFirst({
      where: and(eq(recruitmentApplicationProfile.applicationId, applicationId), eq(recruitmentApplicationProfile.organizationId, orgId)),
    }),
    db.query.recruitmentRequirementState.findFirst({
      where: and(eq(recruitmentRequirementState.jobId, app.jobId), eq(recruitmentRequirementState.organizationId, orgId)),
    }),
    db.query.job.findFirst({
      where: and(eq(job.id, app.jobId), eq(job.organizationId, orgId)),
      columns: { id: true, title: true, description: true },
    }),
    db.query.jobSkillMatrix.findFirst({
      where: and(eq(jobSkillMatrix.jobId, app.jobId), eq(jobSkillMatrix.organizationId, orgId)),
    }),
    db.query.document.findMany({
      where: and(eq(document.organizationId, orgId), eq(document.candidateId, app.candidateId), eq(document.type, 'resume')),
      orderBy: [desc(document.createdAt)],
      columns: { id: true, originalFilename: true, parsedContent: true },
    }),
  ])

  if (!profile) throw createError({ statusCode: 404, statusMessage: 'Recruitment profile not found' })
  const latestResume = resumeCandidates.find(resume => Boolean(extractResumeText(resume.parsedContent)))
  if (!latestResume) throw createError({ statusCode: 422, statusMessage: 'A readable resume is required before AI match analysis.' })
  if (!jobRecord?.description) throw createError({ statusCode: 422, statusMessage: 'Save the Active JD before AI candidate analysis.' })
  if (!requirementState?.skillMatrixApproved || !matrixRecord?.approvedMatrix) {
    throw createError({ statusCode: 422, statusMessage: 'Approve the Skill Matrix before calculating the candidate match percentage.' })
  }

  const requirementRevision = requirementState.revision
  const existingMatch = await db.query.talentPoolMatch.findFirst({
    where: and(
      eq(talentPoolMatch.organizationId, orgId),
      eq(talentPoolMatch.jobId, app.jobId),
      eq(talentPoolMatch.candidateId, app.candidateId),
    ),
  })

  const reusableCurrentAssessment = Boolean(
    profile.lastStatus === 'resume_reviewed'
    && profile.selectedResumeDocumentId === latestResume.id
    && existingMatch?.resumeDocumentId === latestResume.id
    && existingMatch.requirementVersion === requirementRevision
    && existingMatch.assessedAt,
  )
  if (!allowedNewAssessmentStatuses.has(profile.lastStatus) && !reusableCurrentAssessment) {
    throw createError({
      statusCode: 409,
      statusMessage: 'This candidate is already progressing in recruitment. Open the Recruitment Workspace and use Reassess before replacing the assessed resume or recalculating the AI match.',
    })
  }

  let generated: any
  let ranking: { score: number; priority: 'P1' | 'P2' | 'P3' | 'P4' }
  let reusedAssessment = false

  if (existingMatch?.resumeDocumentId === latestResume.id && existingMatch.requirementVersion === requirementRevision && existingMatch.assessedAt) {
    generated = {
      candidateSnapshot: existingMatch.candidateSnapshot,
      jdAlignment: existingMatch.jdAlignment,
      skillAssessment: existingMatch.skillAssessment,
      keyGaps: existingMatch.keyGaps,
      verificationAreas: existingMatch.verificationAreas,
      mandatoryScore: existingMatch.mandatoryScore,
      preferredScore: existingMatch.preferredScore,
      experienceScore: existingMatch.experienceScore,
      optionalScore: existingMatch.optionalScore,
      mandatoryMatch: existingMatch.mandatoryMatch,
      keyStrength: existingMatch.keyStrength,
      mainGap: existingMatch.mainGap,
    }
    ranking = { score: existingMatch.score ?? 0, priority: (existingMatch.priority ?? 'P4') as 'P1' | 'P2' | 'P3' | 'P4' }
    reusedAssessment = true
  }
  else {
    const config = await loadAiConfig(orgId, { purpose: 'analysis' })
    const providerConfig = {
      provider: config.provider as SupportedProvider,
      model: config.model,
      apiKeyEncrypted: config.apiKeyEncrypted,
      baseUrl: config.baseUrl,
      maxTokens: config.maxTokens,
    }
    generated = await generatePdsResumeAssessment(providerConfig, {
      jobTitle: jobRecord.title,
      jobDescription: jobRecord.description,
      skillMatrix: matrixRecord.approvedMatrix,
      resumeContent: latestResume.parsedContent,
    })
    ranking = calculateProvisionalFit({
      mandatoryScore: generated.mandatoryScore,
      preferredScore: generated.preferredScore,
      experienceScore: generated.experienceScore,
      optionalScore: generated.optionalScore,
    })

    const now = new Date()
    const matchValues = {
      organizationId: orgId,
      jobId: app.jobId,
      candidateId: app.candidateId,
      resumeDocumentId: latestResume.id,
      requirementVersion: requirementRevision,
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
      source: 'jd_upload' as const,
      assessedAt: now,
      updatedAt: now,
    }
    if (existingMatch) await db.update(talentPoolMatch).set(matchValues).where(eq(talentPoolMatch.id, existingMatch.id))
    else await db.insert(talentPoolMatch).values(matchValues)
  }

  const now = new Date()
  const existingAssessment = await db.query.resumeAssessment.findFirst({
    where: and(eq(resumeAssessment.applicationId, applicationId), eq(resumeAssessment.organizationId, orgId)),
    columns: { id: true },
  })
  const assessmentValues = {
    organizationId: orgId,
    applicationId,
    candidateSnapshot: generated.candidateSnapshot,
    jdAlignment: generated.jdAlignment,
    skillAssessment: generated.skillAssessment,
    keyGaps: generated.keyGaps,
    verificationAreas: generated.verificationAreas,
    mandatoryScore: generated.mandatoryScore,
    preferredScore: generated.preferredScore,
    experienceScore: generated.experienceScore,
    optionalScore: generated.optionalScore,
    provisionalFitScore: ranking.score,
    mandatoryMatch: generated.mandatoryMatch,
    keyStrength: generated.keyStrength,
    mainGap: generated.mainGap,
    priority: ranking.priority,
    requirementVersion: requirementRevision,
    source: 'ai' as const,
    assessedBy: session.user.id,
    assessedAt: now,
    updatedAt: now,
  }
  if (existingAssessment) await db.update(resumeAssessment).set(assessmentValues).where(eq(resumeAssessment.id, existingAssessment.id))
  else await db.insert(resumeAssessment).values(assessmentValues)

  await db.update(recruitmentApplicationProfile).set({
    selectedResumeDocumentId: latestResume.id,
    lastStatus: 'resume_reviewed',
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
    aiSummaryStale: false,
    aiSummaryUpdatedAt: now,
    requirementVersionAssessed: requirementRevision,
    nextAction: `AI match ${ranking.score}%. Review the evidence or validate manually through Recruiter Screening.`,
    lastUpdatedBy: session.user.id,
    updatedAt: now,
  }).where(eq(recruitmentApplicationProfile.id, profile.id))
  await syncApplicationStatusForRecruitmentStage(orgId, applicationId, 'resume_reviewed')

  await db.insert(recruitmentEvidence).values({
    organizationId: orgId,
    applicationId,
    type: 'resume',
    summary: `Initial AI match against approved JD and Skill Matrix: ${ranking.score}%`,
    payload: {
      event: 'quick_match_completed',
      selectedResumeDocumentId: latestResume.id,
      selectedResumeFilename: latestResume.originalFilename,
      provisionalFitScore: ranking.score,
      priority: ranking.priority,
      mandatoryMatch: generated.mandatoryMatch,
      requirementRevision,
      reusedAssessment,
      humanValidationAvailable: true,
    },
    createdBy: session.user.id,
  })

  return {
    applicationId,
    score: ranking.score,
    priority: ranking.priority,
    mandatoryMatch: generated.mandatoryMatch,
    keyStrength: generated.keyStrength,
    mainGap: generated.mainGap,
    candidateSnapshot: generated.candidateSnapshot,
    jdAlignment: generated.jdAlignment,
    visibleInCandidatePool: false,
    threshold: 50,
    reusedAssessment,
    currentFit: profile.currentFit,
    manualValidationAvailable: true,
  }
})