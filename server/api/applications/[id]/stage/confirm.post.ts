import { and, eq } from 'drizzle-orm'
import { application, recruitmentApplicationProfile, recruitmentEvidence } from '../../../../database/schema'
import { confirmRecruitmentStageSchema, CONFIRMED_STAGE_TRANSITIONS } from '../../../../utils/schemas/recruitmentStage'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { id: applicationId } = await getValidatedRouterParams(event, paramsSchema.parse)
  const body = await readValidatedBody(event, confirmRecruitmentStageSchema.parse)

  const app = await db.query.application.findFirst({
    where: and(eq(application.id, applicationId), eq(application.organizationId, orgId)),
    columns: { id: true },
  })
  if (!app) throw createError({ statusCode: 404, statusMessage: 'Application not found' })

  const profile = await db.query.recruitmentApplicationProfile.findFirst({
    where: and(eq(recruitmentApplicationProfile.applicationId, applicationId), eq(recruitmentApplicationProfile.organizationId, orgId)),
  })
  if (!profile) throw createError({ statusCode: 404, statusMessage: 'Recruitment profile not found' })

  if (body.stage === profile.lastStatus) return { profile, changed: false }

  const allowed = CONFIRMED_STAGE_TRANSITIONS[profile.lastStatus] ?? []
  if (!allowed.includes(body.stage)) {
    throw createError({
      statusCode: 422,
      statusMessage: `Cannot confirm stage change from ${profile.lastStatus} to ${body.stage}.`,
    })
  }

  const now = new Date()
  const [updated] = await db.update(recruitmentApplicationProfile).set({
    lastStatus: body.stage,
    statusDate: now,
    nextAction: body.nextAction ?? profile.nextAction,
    lastContactAt: body.contactOccurred ? now : profile.lastContactAt,
    lastUpdatedBy: session.user.id,
    updatedAt: now,
  }).where(eq(recruitmentApplicationProfile.id, profile.id)).returning()

  await db.insert(recruitmentEvidence).values({
    organizationId: orgId,
    applicationId,
    type: 'stage_change',
    summary: body.note ?? `Confirmed recruitment stage: ${body.stage}`,
    payload: { event: 'stage_confirmed', from: profile.lastStatus, to: body.stage },
    createdBy: session.user.id,
  })

  return { profile: updated, changed: true }
})
