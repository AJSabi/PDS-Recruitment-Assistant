import { and, eq } from 'drizzle-orm'
import { recruitmentApplicationProfile, recruitmentEvidence, recruitmentRequirementState } from '../../../database/schema'
import { finalScreeningFitSchema } from '../../../utils/schemas/recruitmentWorkflow'
import { CONFIRMED_STAGE_TRANSITIONS } from '../../../utils/schemas/recruitmentStage'
import { refreshRequirementReassessmentFlag } from '../../../utils/recruitmentLifecycle'
import { syncApplicationStatusForRecruitmentStage } from '../../../utils/recruitmentApplicationStatus'
import { assertApplicationAccess } from '../../../utils/recruitmentVisibility'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })
const bodySchema = z.object({
  summary: z.string().trim().min(1).max(3000),
  currentFit: finalScreeningFitSchema.optional(),
  conversationBrief: z.string().trim().max(3000).nullish(),
  nextAction: z.string().trim().max(1000).nullish(),
  payload: z.record(z.string(), z.unknown()).nullish(),
}).strict()

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { id: applicationId } = await getValidatedRouterParams(event, paramsSchema.parse)
  const app = await assertApplicationAccess(orgId, session.user.id, applicationId)
  const body = await readValidatedBody(event, bodySchema.parse)

  const profile = await db.query.recruitmentApplicationProfile.findFirst({
    where: and(eq(recruitmentApplicationProfile.applicationId, applicationId), eq(recruitmentApplicationProfile.organizationId, orgId)),
  })
  if (!profile) throw createError({ statusCode: 404, statusMessage: 'Recruitment profile not found' })

  if (profile.lastStatus !== 'reassess') {
    const allowed = CONFIRMED_STAGE_TRANSITIONS[profile.lastStatus] ?? []
    if (!allowed.includes('reassess')) throw createError({ statusCode: 422, statusMessage: `Reassessment cannot start while candidate status is ${profile.lastStatus}.` })
  }

  const requirementState = await db.query.recruitmentRequirementState.findFirst({
    where: and(eq(recruitmentRequirementState.jobId, app.jobId), eq(recruitmentRequirementState.organizationId, orgId)),
  })
  const requirementRevision = requirementState?.revision ?? 1
  const now = new Date()

  const [updatedProfile] = await db.update(recruitmentApplicationProfile).set({
    ...(body.currentFit ? { currentFit: body.currentFit } : {}),
    lastStatus: 'reassess',
    statusDate: now,
    conversationBrief: body.conversationBrief ?? profile.conversationBrief,
    nextAction: body.nextAction ?? profile.nextAction,
    assessmentLocked: body.currentFit ? true : profile.assessmentLocked,
    requirementVersionAssessed: body.currentFit ? requirementRevision : profile.requirementVersionAssessed,
    lastUpdatedBy: session.user.id,
    updatedAt: now,
  }).where(eq(recruitmentApplicationProfile.id, profile.id)).returning()

  await syncApplicationStatusForRecruitmentStage(orgId, applicationId, 'reassess')
  const [evidence] = await db.insert(recruitmentEvidence).values({ organizationId: orgId, applicationId, type: 'manual_reassessment', summary: body.summary, payload: { ...body.payload, previousFit: profile.currentFit, newFit: body.currentFit ?? profile.currentFit, requirementRevision, fitChanged: Boolean(body.currentFit && body.currentFit !== profile.currentFit) }, createdBy: session.user.id }).returning()
  if (body.currentFit) await refreshRequirementReassessmentFlag(orgId, app.jobId)

  return { profile: updatedProfile, evidence, requirementRevision }
})
