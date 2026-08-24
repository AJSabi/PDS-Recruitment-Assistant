import { and, eq } from 'drizzle-orm'
import { application, recruitmentApplicationProfile, recruitmentEvidence, resumeAssessment } from '../../../../../database/schema'
import { saveResumeAssessmentSchema } from '../../../../../utils/schemas/resumeAssessment'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { id: applicationId } = await getValidatedRouterParams(event, paramsSchema.parse)
  const body = await readValidatedBody(event, saveResumeAssessmentSchema.parse)

  const app = await db.query.application.findFirst({
    where: and(eq(application.id, applicationId), eq(application.organizationId, orgId)),
    columns: { id: true },
  })
  if (!app) throw createError({ statusCode: 404, statusMessage: 'Application not found' })

  const existing = await db.query.resumeAssessment.findFirst({
    where: and(eq(resumeAssessment.applicationId, applicationId), eq(resumeAssessment.organizationId, orgId)),
    columns: { id: true },
  })

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
    provisionalFitScore: body.provisionalFitScore ?? null,
    mandatoryMatch: body.mandatoryMatch ?? null,
    keyStrength: body.keyStrength ?? null,
    mainGap: body.mainGap ?? null,
    priority: body.priority ?? null,
    requirementVersion: body.requirementVersion,
    source: body.source,
    assessedBy: session.user.id,
    assessedAt: new Date(),
    updatedAt: new Date(),
  }

  const [assessment] = existing
    ? await db.update(resumeAssessment).set(values).where(eq(resumeAssessment.id, existing.id)).returning()
    : await db.insert(resumeAssessment).values(values).returning()

  const profile = await db.query.recruitmentApplicationProfile.findFirst({
    where: and(eq(recruitmentApplicationProfile.applicationId, applicationId), eq(recruitmentApplicationProfile.organizationId, orgId)),
    columns: { id: true, assessmentLocked: true },
  })

  if (profile) {
    await db.update(recruitmentApplicationProfile).set({
      lastStatus: 'resume_reviewed',
      statusDate: new Date(),
      resumeBrief: body.candidateSnapshot ?? undefined,
      provisionalFitScore: body.provisionalFitScore ?? undefined,
      priority: body.priority ?? undefined,
      mandatoryMatch: body.mandatoryMatch ?? undefined,
      keyStrength: body.keyStrength ?? undefined,
      mainGap: body.mainGap ?? undefined,
      requirementVersionAssessed: body.requirementVersion,
      nextAction: 'Recruiter screening / comparison',
      lastUpdatedBy: session.user.id,
      updatedAt: new Date(),
    }).where(eq(recruitmentApplicationProfile.id, profile.id))
  }

  await db.insert(recruitmentEvidence).values({
    organizationId: orgId,
    applicationId,
    type: 'resume',
    summary: body.candidateSnapshot ?? 'Resume assessment updated',
    payload: {
      provisionalFitScore: body.provisionalFitScore ?? null,
      priority: body.priority ?? null,
      mandatoryMatch: body.mandatoryMatch ?? null,
      requirementVersion: body.requirementVersion,
      source: body.source,
    },
    createdBy: session.user.id,
  })

  return { assessment }
})
