import { and, eq } from 'drizzle-orm'
import { application, recruitmentApplicationProfile, recruitmentEvidence, recruitmentRequirementState, resumeAssessment } from '../../../../database/schema'
import { saveResumeAssessmentSchema } from '../../../../utils/schemas/resumeAssessment'
import { calculateProvisionalFit } from '../../../../utils/recruitmentScoring'
import { refreshRequirementReassessmentFlag } from '../../../../utils/recruitmentLifecycle'
import { coarseStatusForRecruitmentStage } from '../../../../utils/recruitmentApplicationStatus'
import { assertApplicationAccess } from '../../../../utils/recruitmentVisibility'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })
const allowedStatuses = new Set(['resume_received', 'resume_reviewed', 'reassess'])

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { id: applicationId } = await getValidatedRouterParams(event, paramsSchema.parse)
  const app = await assertApplicationAccess(orgId, session.user.id, applicationId)
  const body = await readValidatedBody(event, saveResumeAssessmentSchema.parse)

  const profile = await db.query.recruitmentApplicationProfile.findFirst({
    where: and(eq(recruitmentApplicationProfile.applicationId, applicationId), eq(recruitmentApplicationProfile.organizationId, orgId)),
  })
  if (!profile) throw createError({ statusCode: 404, statusMessage: 'Recruitment profile not found' })
  if (!profile.selectedResumeDocumentId) throw createError({ statusCode: 422, statusMessage: 'Select the resume for this application before assessment.' })
  if (!allowedStatuses.has(profile.lastStatus)) throw createError({ statusCode: 422, statusMessage: `Resume assessment is not allowed while candidate status is ${profile.lastStatus}.` })

  const requirementState = await db.query.recruitmentRequirementState.findFirst({
    where: and(eq(recruitmentRequirementState.jobId, app.jobId), eq(recruitmentRequirementState.organizationId, orgId)),
  })
  if (!requirementState?.skillMatrixApproved) throw createError({ statusCode: 422, statusMessage: 'Approve the Skill Matrix before assessing candidates.' })
  const requirementRevision = requirementState.revision

  const existing = await db.query.resumeAssessment.findFirst({
    where: and(eq(resumeAssessment.applicationId, applicationId), eq(resumeAssessment.organizationId, orgId)),
    columns: { id: true, updatedAt: true },
  })
  const hasComponentScores = body.mandatoryScore != null
  const calculated = hasComponentScores ? calculateProvisionalFit({ mandatoryScore: body.mandatoryScore, preferredScore: body.preferredScore, experienceScore: body.experienceScore, optionalScore: body.optionalScore }) : null
  const provisionalFitScore = calculated?.score ?? null
  const priority = calculated?.priority ?? null
  const now = new Date()

  const values = {
    organizationId: orgId,
    applicationId,
    candidateSnapshot: body.candidateSnapshot ?? null,
    jdAlignment: body.jdAlignment ?? null,
    skillAssessment: body.skillAssessment,
    keyGaps: body.keyGaps,
    verificationAreas: body.verificationAreas,
    mandatoryScore: body.mandatoryScore ?? null,
    preferredScore: body.preferredScore ?? null,
    experienceScore: body.experienceScore ?? null,
    optionalScore: body.optionalScore ?? null,
    provisionalFitScore,
    mandatoryMatch: body.mandatoryMatch ?? null,
    keyStrength: body.keyStrength ?? null,
    mainGap: body.mainGap ?? null,
    priority,
    requirementVersion: requirementRevision,
    source: body.source,
    assessedBy: session.user.id,
    assessedAt: now,
    updatedAt: now,
  }
  const coarseStatus = coarseStatusForRecruitmentStage('resume_reviewed')

  const assessment = await db.transaction(async (tx) => {
    let assessmentRow
    if (existing) {
      ;[assessmentRow] = await tx.update(resumeAssessment).set(values).where(and(
        eq(resumeAssessment.id, existing.id),
        eq(resumeAssessment.organizationId, orgId),
        eq(resumeAssessment.updatedAt, existing.updatedAt),
      )).returning()
      if (!assessmentRow) throw createError({ statusCode: 409, statusMessage: 'Resume assessment changed before this save completed. Refresh and try again.' })
    } else {
      ;[assessmentRow] = await tx.insert(resumeAssessment).values(values).returning()
    }

    const [profileUpdated] = await tx.update(recruitmentApplicationProfile).set({
      lastStatus: 'resume_reviewed',
      statusDate: now,
      resumeBrief: body.candidateSnapshot ?? profile.resumeBrief,
      provisionalFitScore,
      priority,
      mandatoryMatch: body.mandatoryMatch ?? null,
      keyStrength: body.keyStrength ?? null,
      mainGap: body.mainGap ?? null,
      requirementVersionAssessed: requirementRevision,
      nextAction: 'Recruiter screening / comparison',
      lastUpdatedBy: session.user.id,
      updatedAt: now,
    }).where(and(
      eq(recruitmentApplicationProfile.id, profile.id),
      eq(recruitmentApplicationProfile.organizationId, orgId),
      eq(recruitmentApplicationProfile.lastStatus, profile.lastStatus),
      eq(recruitmentApplicationProfile.updatedAt, profile.updatedAt),
    )).returning({ id: recruitmentApplicationProfile.id })
    if (!profileUpdated) throw createError({ statusCode: 409, statusMessage: 'Recruitment profile changed before the resume assessment could be saved. Refresh and try again.' })

    if (coarseStatus) {
      const [applicationUpdated] = await tx.update(application)
        .set({ status: coarseStatus, updatedAt: now })
        .where(and(eq(application.id, applicationId), eq(application.organizationId, orgId)))
        .returning({ id: application.id })
      if (!applicationUpdated) throw createError({ statusCode: 409, statusMessage: 'Application changed before the resume assessment could be saved. Refresh and try again.' })
    }

    if (profile.lastStatus !== 'resume_reviewed') {
      await tx.insert(recruitmentEvidence).values({
        organizationId: orgId,
        applicationId,
        type: 'stage_change',
        summary: `Recruitment stage changed from ${profile.lastStatus} to resume_reviewed`,
        payload: {
          event: 'stage_changed',
          from: profile.lastStatus,
          to: 'resume_reviewed',
          source: 'resume_assessment',
          requirementRevision,
        },
        createdBy: session.user.id,
      })
    }

    await tx.insert(recruitmentEvidence).values({
      organizationId: orgId,
      applicationId,
      type: 'resume',
      summary: body.candidateSnapshot ?? 'Resume assessment updated',
      payload: {
        event: 'resume_assessed',
        selectedResumeDocumentId: profile.selectedResumeDocumentId,
        provisionalFitScore,
        priority,
        mandatoryMatch: body.mandatoryMatch ?? null,
        requirementRevision,
        source: body.source,
      },
      createdBy: session.user.id,
    })

    return assessmentRow
  })

  await refreshRequirementReassessmentFlag(orgId, app.jobId)

  return { assessment, ranking: { provisionalFitScore, priority }, requirementRevision }
})