import { and, eq } from 'drizzle-orm'
import { application, recruitmentApplicationProfile, recruitmentEvidence, recruitmentRequirementState } from '../../../database/schema'
import { currentFitSchema } from '../../../utils/schemas/recruitmentWorkflow'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })
const bodySchema = z.object({
  summary: z.string().trim().min(1).max(3000),
  currentFit: currentFitSchema.optional(),
  conversationBrief: z.string().trim().max(3000).nullish(),
  nextAction: z.string().trim().max(1000).nullish(),
  payload: z.record(z.string(), z.unknown()).nullish(),
}).strict()

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { id: applicationId } = await getValidatedRouterParams(event, paramsSchema.parse)
  const body = await readValidatedBody(event, bodySchema.parse)

  const app = await db.query.application.findFirst({
    where: and(eq(application.id, applicationId), eq(application.organizationId, orgId)),
    columns: { id: true, jobId: true },
  })
  if (!app) throw createError({ statusCode: 404, statusMessage: 'Application not found' })

  const profile = await db.query.recruitmentApplicationProfile.findFirst({
    where: and(eq(recruitmentApplicationProfile.applicationId, applicationId), eq(recruitmentApplicationProfile.organizationId, orgId)),
  })
  if (!profile) throw createError({ statusCode: 404, statusMessage: 'Recruitment profile not found' })

  const requirementState = await db.query.recruitmentRequirementState.findFirst({
    where: and(eq(recruitmentRequirementState.jobId, app.jobId), eq(recruitmentRequirementState.organizationId, orgId)),
  })
  const requirementVersion = Math.max(requirementState?.jdVersion ?? 1, requirementState?.skillMatrixVersion ?? 0)
  const now = new Date()

  const [updatedProfile] = await db.update(recruitmentApplicationProfile)
    .set({
      ...(body.currentFit ? { currentFit: body.currentFit } : {}),
      lastStatus: 'reassess',
      statusDate: now,
      conversationBrief: body.conversationBrief ?? profile.conversationBrief,
      nextAction: body.nextAction ?? profile.nextAction,
      assessmentLocked: Boolean(body.currentFit),
      requirementVersionAssessed: requirementVersion,
      lastUpdatedBy: session.user.id,
      updatedAt: now,
    })
    .where(eq(recruitmentApplicationProfile.id, profile.id))
    .returning()

  const [evidence] = await db.insert(recruitmentEvidence).values({
    organizationId: orgId,
    applicationId,
    type: 'manual_reassessment',
    summary: body.summary,
    payload: {
      ...body.payload,
      previousFit: profile.currentFit,
      newFit: body.currentFit ?? profile.currentFit,
      requirementVersion,
    },
    createdBy: session.user.id,
  }).returning()

  return { profile: updatedProfile, evidence }
})
