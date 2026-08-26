import { and, eq } from 'drizzle-orm'
import { recruitmentApplicationProfile, recruitmentEvidence } from '../../../../database/schema'
import { createEvidenceSchema } from '../../../../utils/schemas/recruitmentWorkflow'
import { assertApplicationAccess } from '../../../../utils/recruitmentVisibility'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })
const resumeAllowedStatuses = new Set(['candidate_added', 'resume_received', 'reassess'])

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { id: applicationId } = await getValidatedRouterParams(event, paramsSchema.parse)
  await assertApplicationAccess(orgId, session.user.id, applicationId)
  const body = await readValidatedBody(event, createEvidenceSchema.parse)

  if (body.type !== 'resume') {
    throw createError({ statusCode: 422, statusMessage: 'Use the dedicated workflow endpoint for this evidence type.' })
  }

  const profile = await db.query.recruitmentApplicationProfile.findFirst({
    where: and(eq(recruitmentApplicationProfile.applicationId, applicationId), eq(recruitmentApplicationProfile.organizationId, orgId)),
  })
  if (!profile) throw createError({ statusCode: 404, statusMessage: 'Recruitment profile not found' })
  if (!resumeAllowedStatuses.has(profile.lastStatus)) {
    throw createError({ statusCode: 422, statusMessage: `Resume receipt cannot be recorded while candidate status is ${profile.lastStatus}.` })
  }

  const [evidence] = await db.insert(recruitmentEvidence).values({
    organizationId: orgId,
    applicationId,
    type: 'resume',
    summary: body.summary ?? 'Resume received',
    payload: body.payload ?? null,
    createdBy: session.user.id,
  }).returning()

  const now = new Date()
  await db.update(recruitmentApplicationProfile).set({
    lastStatus: 'resume_received',
    statusDate: now,
    nextAction: 'Complete resume assessment against the approved requirement baseline.',
    lastUpdatedBy: session.user.id,
    updatedAt: now,
  }).where(eq(recruitmentApplicationProfile.id, profile.id))

  return { evidence }
})
