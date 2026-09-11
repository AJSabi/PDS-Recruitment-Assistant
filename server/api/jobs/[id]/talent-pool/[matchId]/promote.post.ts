import { and, eq } from 'drizzle-orm'
import {
  application,
  applicationSource,
  job,
  jobSkillMatrix,
  recruiterScreeningSession,
  recruitmentApplicationProfile,
  recruitmentEvidence,
  recruitmentRequirementState,
  resumeAssessment,
  talentPoolMatch,
} from '../../../../../database/schema'
import { applicationSourcePersistence } from '../../../../../utils/recruitmentSource'
import { assertRequirementAccess } from '../../../../../utils/recruitmentVisibility'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1), matchId: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['create', 'update'] })
  const orgId = session.session.activeOrganizationId
  const { id: jobId, matchId } = await getValidatedRouterParams(event, paramsSchema.parse)
  await assertRequirementAccess(orgId, session.user.id, jobId)

  const [jobRecord, matrixRecord, match, requirementState] = await Promise.all([
    db.query.job.findFirst({
      where: and(eq(job.id, jobId), eq(job.organizationId, orgId)),
      columns: { id: true, description: true },
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
    db.query.recruitmentRequirementState.findFirst({
      where: and(
        eq(recruitmentRequirementState.organizationId, orgId),
        eq(recruitmentRequirementState.jobId, jobId),
      ),
      columns: { ownerUserId: true },
    }),
  ])

  if (!jobRecord) throw createError({ statusCode: 404, statusMessage: 'Requirement not found' })
  if (!match) throw createError({ statusCode: 404, statusMessage: 'Talent pool match not found' })
  if (!match.resumeDocumentId) throw createError({ statusCode: 422, statusMessage: 'The matched resume is no longer available.' })
  if (!matrixRecord?.approvedMatrix || !jobRecord.description) throw createError({ statusCode: 422, statusMessage: 'Active JD and approved Skill Matrix are required.' })

  // AI match scores are advisory evidence, never an employment-decision gate. A recruiter with
  // access to the Requirement may promote a reviewed talent-pool candidate regardless of score.
  if (match.promotedApplicationId) return { applicationId: match.promotedApplicationId, alreadyPromoted: true, aiCalls: 0 }

  const existingApplication = await db.query.application.findFirst({
    where: and(
      eq(application.organizationId, orgId),
      eq(application.jobId, jobId),
      eq(application.candidateId, match.candidateId),
    ),
    columns: { id: true },
  })
  if (existingApplication) {
    await db.transaction(async (tx) => {
      await tx.update(talentPoolMatch)
        .set({ promotedApplicationId: existingApplication.id, updatedAt: new Date() })
        .where(and(eq(talentPoolMatch.id, match.id), eq(talentPoolMatch.organizationId, orgId)))
      if (requirementState?.ownerUserId) {
        await tx.update(recruitmentApplicationProfile).set({
          assignedRecruiterId: requirementState.ownerUserId,
          updatedAt: new Date(),
        }).where(and(
          eq(recruitmentApplicationProfile.organizationId, orgId),
          eq(recruitmentApplicationProfile.applicationId, existingApplication.id),
        ))
      }
    })
    return { applicationId: existingApplication.id, alreadyPromoted: true, aiCalls: 0 }
  }

  const now = new Date()
  const governedSource = match.source === 'database' ? 'existing_database' : 'recruiter_sourcing'
  const sourcePersistence = applicationSourcePersistence(governedSource)

  const applicationId = await db.transaction(async (tx) => {
    const [created] = await tx.insert(application).values({
      organizationId: orgId,
      candidateId: match.candidateId,
      jobId,
      status: 'new',
      score: match.score,
      notes: 'Promoted from AI Candidate Pool by recruiter decision',
    }).returning({ id: application.id })
    if (!created) throw createError({ statusCode: 500, statusMessage: 'Failed to create recruitment application.' })

    await tx.insert(applicationSource).values({
      organizationId: orgId,
      applicationId: created.id,
      channel: sourcePersistence.channel,
      utmSource: sourcePersistence.utmSource,
    })

    await tx.insert(recruitmentApplicationProfile).values({
      organizationId: orgId,
      applicationId: created.id,
      selectedResumeDocumentId: match.resumeDocumentId,
      assignedRecruiterId: requirementState?.ownerUserId ?? null,
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
      aiCandidateSummary: match.candidateSnapshot,
      aiOverallAssessment: match.jdAlignment,
      aiInterviewBriefs: [],
      aiFinalBrief: null,
      aiEvidenceConfidence: 'limited',
      aiSummaryStale: false,
      aiSummaryUpdatedAt: match.assessedAt ?? now,
      requirementVersionAssessed: match.requirementVersion,
      lastUpdatedBy: session.user.id,
      updatedAt: now,
    })

    await tx.insert(resumeAssessment).values({
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

    // Promotion is a recruiter sourcing decision, not consent to spend AI on screening.
    // Screening questions are prepared only when the recruiter explicitly requests them.
    await tx.insert(recruiterScreeningSession).values({
      organizationId: orgId,
      applicationId: created.id,
      status: 'not_started',
      questions: [],
      responses: [],
      validationFocus: [],
    })

    await tx.insert(recruitmentEvidence).values({
      organizationId: orgId,
      jobId,
      applicationId: created.id,
      candidateId: match.candidateId,
      type: 'sourcing',
      summary: 'Candidate sourced from reviewed talent pool',
      sourceRef: governedSource,
      payload: {
        event: 'candidate_sourced',
        source: governedSource,
        talentPoolMatchId: match.id,
        recruiterPromoted: true,
      },
      createdBy: session.user.id,
    })

    await tx.insert(recruitmentEvidence).values({
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
        governedRecruitmentSource: governedSource,
        screeningQuestionsGenerated: 0,
        screeningQuestionsRequireExplicitRecruiterAction: true,
        assignedRecruiterId: requirementState?.ownerUserId ?? null,
        promotionDecision: 'recruiter_confirmed',
      },
      createdBy: session.user.id,
    })

    const [promoted] = await tx.update(talentPoolMatch)
      .set({ promotedApplicationId: created.id, updatedAt: now })
      .where(and(
        eq(talentPoolMatch.id, match.id),
        eq(talentPoolMatch.organizationId, orgId),
        eq(talentPoolMatch.jobId, jobId),
      ))
      .returning({ id: talentPoolMatch.id })
    if (!promoted) throw createError({ statusCode: 409, statusMessage: 'Talent-pool match changed before promotion completed. Refresh and try again.' })

    return created.id
  })

  return {
    applicationId,
    alreadyPromoted: false,
    source: governedSource,
    screeningQuestions: 0,
    screeningQuestionsPending: true,
    aiCalls: 0,
  }
})