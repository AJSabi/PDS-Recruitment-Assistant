import { and, eq } from 'drizzle-orm'
import { recruitmentApplicationProfile, recruitmentEvidence, recruitmentRequirementState, resumeAssessment } from '../../../../database/schema'
import { saveResumeAssessmentSchema } from '../../../../utils/schemas/resumeAssessment'
import { calculateProvisionalFit } from '../../../../utils/recruitmentScoring'
import { refreshRequirementReassessmentFlag } from '../../../../utils/recruitmentLifecycle'
import { recordRecruitmentStageChange } from '../../../../utils/recruitmentStageHistory'
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

  const existing = await db.query.resumeAssessment.findFirst({ where: and(eq(resumeAssessment.applicationId, applicationId), eq(resumeAssessment.organizationId, orgId)), columns: { id: true } })
  const hasComponentScores = body.mandatoryScore != null
  const calculated = hasComponentScores ? calculateProvisionalFit({ mandatoryScore: body.mandatoryScore, preferredScore: body.preferredScore, experienceScore: body.experienceScore, optionalScore: body.optionalScore }) : null
  const provisionalFitScore = calculated?.score ?? null
  const priority = calculated?.priority ?? null
  const now = new Date()

  const values = {
    organizationId: orgId, applicationId, candidateSnapshot: body.candidateSnapshot ?? null, jdAlignment: body.jdAlignment ?? null, skillAssessment: body.skillAssessment, keyGaps: body.keyGaps, verificationAreas: body.verificationAreas,
    mandatoryScore: body.mandatoryScore ?? null, preferredScore: body.preferredScore ?? null, experienceScore: body.experienceScore ?? null, optionalScore: body.optionalScore ?? null, provisionalFitScore,
    mandatoryMatch: body.mandatoryMatch ?? null, keyStrength: body.keyStrength ?? null, mainGap: body.mainGap ?? null, priority, requirementVersion: requirementRevision, source: body.source, assessedBy: session.user.id, assessedAt: now, updatedAt: now,
  }
  const [assessment] = existing ? await db.update(resumeAssessment).set(values).where(eq(resumeAssessment.id, existing.id)).returning() : await db.insert(resumeAssessment).values(values).returning()

  await db.update(recruitmentApplicationProfile).set({ lastStatus: 'resume_reviewed', statusDate: now, resumeBrief: body.candidateSnapshot ?? profile.resumeBrief, provisionalFitScore, priority, mandatoryMatch: body.mandatoryMatch ?? null, keyStrength: body.keyStrength ?? null, mainGap: body.mainGap ?? null, requirementVersionAssessed: requirementRevision, nextAction: 'Recruiter screening / comparison', lastUpdatedBy: session.user.id, updatedAt: now }).where(eq(recruitmentApplicationProfile.id, profile.id))
  if (profile.lastStatus !== 'resume_reviewed') {
    await recordRecruitmentStageChange({
      organizationId: orgId,
      applicationId,
      from: profile.lastStatus,
      to: 'resume_reviewed',
      actorId: session.user.id,
      source: 'resume_assessment',
      metadata: { requirementRevision },
    })
  }
  await db.insert(recruitmentEvidence).values({ organizationId: orgId, applicationId, type: 'resume', summary: body.candidateSnapshot ?? 'Resume assessment updated', payload: { event: 'resume_assessed', selectedResumeDocumentId: profile.selectedResumeDocumentId, provisionalFitScore, priority, mandatoryMatch: body.mandatoryMatch ?? null, requirementRevision, source: body.source }, createdBy: session.user.id })
  await refreshRequirementReassessmentFlag(orgId, app.jobId)

  return { assessment, ranking: { provisionalFitScore, priority }, requirementRevision }
})
