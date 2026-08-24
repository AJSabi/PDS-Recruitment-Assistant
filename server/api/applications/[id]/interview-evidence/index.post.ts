import { and, eq } from 'drizzle-orm'
import { application, recruitmentApplicationProfile, recruitmentEvidence } from '../../../../../database/schema'
import { interviewEvidenceSchema } from '../../../../../utils/schemas/recruitmentStage'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { id: applicationId } = await getValidatedRouterParams(event, paramsSchema.parse)
  const body = await readValidatedBody(event, interviewEvidenceSchema.parse)

  const app = await db.query.application.findFirst({
    where: and(eq(application.id, applicationId), eq(application.organizationId, orgId)),
    columns: { id: true },
  })
  if (!app) throw createError({ statusCode: 404, statusMessage: 'Application not found' })

  const profile = await db.query.recruitmentApplicationProfile.findFirst({
    where: and(eq(recruitmentApplicationProfile.applicationId, applicationId), eq(recruitmentApplicationProfile.organizationId, orgId)),
  })
  if (!profile) throw createError({ statusCode: 404, statusMessage: 'Recruitment profile not found' })

  const [evidence] = await db.insert(recruitmentEvidence).values({
    organizationId: orgId,
    applicationId,
    type: body.interviewType === 'hod' ? 'hod_interview' : 'interview',
    summary: body.summary,
    payload: {
      strengths: body.strengths,
      concerns: body.concerns,
      validationFocus: body.validationFocus,
      recommendation: body.recommendation ?? null,
      fit: body.fit ?? null,
      updateCurrentFit: body.updateCurrentFit,
    },
    createdBy: session.user.id,
  }).returning()

  const now = new Date()
  const updates: Record<string, unknown> = {
    conversationBrief: body.summary,
    lastContactAt: now,
    nextAction: body.recommendation ?? profile.nextAction,
    lastUpdatedBy: session.user.id,
    updatedAt: now,
  }

  // Interview evidence may change Current Fit only when explicitly requested.
  if (body.updateCurrentFit && body.fit) {
    updates.currentFit = body.fit
    updates.assessmentLocked = true
  }

  const [updatedProfile] = await db.update(recruitmentApplicationProfile)
    .set(updates)
    .where(eq(recruitmentApplicationProfile.id, profile.id))
    .returning()

  return {
    evidence,
    profile: updatedProfile,
    recommendation: body.recommendation ?? null,
    statusChanged: false,
  }
})
