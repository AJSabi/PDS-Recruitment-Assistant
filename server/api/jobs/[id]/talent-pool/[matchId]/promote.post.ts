import { and, eq } from 'drizzle-orm'
import {
  application,
  job,
  jobSkillMatrix,
  recruiterScreeningSession,
  recruitmentApplicationProfile,
  recruitmentEvidence,
  resumeAssessment,
  talentPoolMatch,
} from '../../../../../database/schema'
import { loadAiConfig } from '../../../../../utils/ai/loadConfig'
import { generatePdsScreeningQuestions } from '../../../../../utils/ai/pdsScreening'
import type { SupportedProvider } from '../../../../../utils/ai/provider'
import { syncApplicationStatusForRecruitmentStage } from '../../../../../utils/recruitmentApplicationStatus'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1), matchId: z.string().min(1) })
const FINAL_POOL_THRESHOLD = 50

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['create', 'update'], scoring: ['create'] })
  const orgId = session.session.activeOrganizationId
  const { id: jobId, matchId } = await getValidatedRouterParams(event, paramsSchema.parse)

  const [jobRecord, matrixRecord, match] = await Promise.all([
    db.query.job.findFirst({
      where: and(eq(job.id, jobId), eq(job.organizationId, orgId)),
      columns: { id: true, title: true, description: true },
    }),
    db.query.jobSkillMatrix.findFirst({
      where: and(eq(jobSkillMatrix.jobId, jobId), eq(jobSkillMatrix.organizationId, orgId)),
    }),
    db.query.talentPoolMatch.findFirst({
      where: and(
        eq(talentPoolMatch.id, matchId),
        eq(talentPoolMatch.jobId, jobId),
        eq(talentPoolMatch.organizationId, orgId),
      ),
    }),
  ])

  if (!jobRecord) throw createError({ statusCode: 404, statusMessage: 'Job not found' })
  if (!match) throw createError({ statusCode: 404, statusMessage: 'Talent pool match not found' })
  if ((match.score ?? 0) < FINAL_POOL_THRESHOLD) throw createError({ statusCode: 422, statusMessage: 'Only candidates with a 50% or higher AI match can be moved into recruitment.' })
  if (!match.resumeDocumentId) throw createError({ statusCode: 422, statusMessage: 'The matched resume is no longer available.' })
  if (!matrixRecord?.approvedMatrix || !jobRecord.description) throw createError({ statusCode: 422, statusMessage: 'Active JD and approved Skill Matrix are required.' })

  if (match.promotedApplicationId) {
    return { applicationId: match.promotedApplicationId, alreadyPromoted: true }
  }

  const existingApplication = await db.query.application.findFirst({
    where: and(
      eq(application.organizationId, orgId),
      eq(application.jobId, jobId),
      eq(application.candidateId, match.candidateId),
    ),
    columns: { id: true },
  })
  if (existingApplication) {
    await db.update(talentPoolMatch).set({ promotedApplicationId: existingApplication.id, updatedAt: new Date() }).where(eq(talentPoolMatch.id, match.id))
    return { applicationId: existingApplication.id, alreadyPromoted: true }
  }

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
    resumeAssessment: {
      candidateSnapshot: match.candidateSnapshot,
      jdAlignment: match.jdAlignment,
      skillAssessment: match.skillAssessment,
      keyGaps: match.keyGaps,
      verificationAreas: match.verificationAreas,
      mandatoryScore: match.mandatoryScore,
      preferredScore: match.preferredScore,
      experienceScore: match.experienceScore,
      optionalScore: match.optionalScore,
      provisionalFitScore: match.score,
      mandatoryMatch: match.mandatoryMatch,
      keyStrength: match.keyStrength,
      mainGap: match.mainGap,
      priority: match.priority,
    },
  })

  const now = new Date()
  const [created] = await db.insert(application).values({
    organizationId: orgId,
    candidateId: match.candidateId,
    jobId,
    status: 'new',
    score: match.score,
    notes: 'Promoted from AI Candidate Pool',
  }).returning({ id: application.id })

  if (!created) throw createError({ statusCode: 500, statusMessage: 'Failed to create recruitment application.' })

  await db.insert(recruitmentApplicationProfile).values({
    organizationId: orgId,
    applicationId: created.id,
    selectedResumeDocumentId: match.resumeDocumentId,
    currentFit: 'not_yet_assessed',
    lastStatus: 'resume_reviewed',
    statusDate: now,
    resumeBrief: match.candidateSnapshot,
    nextAction: 'Start Recruiter Screening',
    assessmentLocked: false,
    provisionalFitScore: match.score,
    priority: match.priority,
    mandatoryMatch: match.mandatoryMatch,
    keyStrength: match.keyStrength,
    mainGap: match.mainGap,
    requirementVersionAssessed: match.requirementVersion,
    lastUpdatedBy: session.user.id,
    updatedAt: now,
  })

  await db.insert(resumeAssessment).values({
    organizationId: orgId,
    applicationId: created.id,
    candidateSnapshot: match.candidateSnapshot,
    jdAlignment: match.jdAlignment,
    skillAssessment: match.skillAssessment,
    keyGaps: match.keyGaps,
    verificationAreas: match.verificationAreas,
    mandatoryScore: match.mandatoryScore,
    preferredScore: match.preferredScore,
    experienceScore: match.experienceScore,
    optionalScore: match.optionalScore,
    provisionalFitScore: match.score,
    mandatoryMatch: match.mandatoryMatch,
    keyStrength: match.keyStrength,
    mainGap: match.mainGap,
    priority: match.priority,
    requirementVersion: match.requirementVersion,
    source: 'ai',
    assessedBy: session.user.id,
    assessedAt: match.assessedAt ?? now,
    updatedAt: now,
  })

  await db.insert(recruiterScreeningSession).values({
    organizationId: orgId,
    applicationId: created.id,
    status: 'not_started',
    questions,
    responses: [],
    validationFocus: [],
  })

  await db.insert(recruitmentEvidence).values({
    organizationId: orgId,
    applicationId: created.id,
    type: 'resume',
    summary: match.candidateSnapshot ?? 'Candidate promoted from AI Candidate Pool.',
    payload: {
      event: 'talent_pool_promoted',
      talentPoolMatchId: match.id,
      resumeDocumentId: match.resumeDocumentId,
      provisionalFitScore: match.score,
      priority: match.priority,
      source: match.source,
      screeningQuestionsGenerated: questions.length,
    },
    createdBy: session.user.id,
  })

  await syncApplicationStatusForRecruitmentStage(orgId, created.id, 'resume_reviewed')
  await db.update(talentPoolMatch).set({ promotedApplicationId: created.id, updatedAt: now }).where(eq(talentPoolMatch.id, match.id))

  return { applicationId: created.id, alreadyPromoted: false, screeningQuestions: questions.length }
})
