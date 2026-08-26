import { eq, and } from 'drizzle-orm'
import { application, recruitmentApplicationProfile } from '../../database/schema'
import { applicationIdParamSchema, updateApplicationSchema, APPLICATION_STATUS_TRANSITIONS } from '../../utils/schemas/application'
import { assertApplicationAccess } from '../../utils/recruitmentVisibility'

/**
 * PATCH /api/applications/:id
 * Notes/score remain editable here. Once a PDS recruitment profile exists,
 * detailed recruitment stage is the source of truth and status must be changed
 * through the governed stage workflow.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['update'] })
  const orgId = session.session.activeOrganizationId

  const { id } = await getValidatedRouterParams(event, applicationIdParamSchema.parse)
  await assertApplicationAccess(orgId, session.user.id, id)
  const body = await readValidatedBody(event, updateApplicationSchema.parse)

  const current = await db.query.application.findFirst({
    where: and(eq(application.id, id), eq(application.organizationId, orgId)),
    columns: { id: true, status: true },
  })
  if (!current) throw createError({ statusCode: 404, statusMessage: 'Application not found' })

  const recruitmentProfile = await db.query.recruitmentApplicationProfile.findFirst({
    where: and(
      eq(recruitmentApplicationProfile.applicationId, id),
      eq(recruitmentApplicationProfile.organizationId, orgId),
    ),
    columns: { id: true },
  })

  if (body.status && body.status !== current.status && recruitmentProfile) {
    throw createError({
      statusCode: 409,
      statusMessage: 'This application uses the PDS recruitment workflow. Change status through the confirmed recruitment stage action.',
    })
  }

  if (body.status && body.status !== current.status) {
    const allowed = APPLICATION_STATUS_TRANSITIONS[current.status] ?? []
    if (!allowed.includes(body.status)) {
      throw createError({
        statusCode: 422,
        statusMessage: `Cannot transition from "${current.status}" to "${body.status}". Allowed: ${allowed.join(', ') || 'none'}`,
      })
    }
  }

  const [updated] = await db.update(application)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(application.id, id), eq(application.organizationId, orgId)))
    .returning({
      id: application.id,
      candidateId: application.candidateId,
      jobId: application.jobId,
      status: application.status,
      score: application.score,
      notes: application.notes,
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
    })

  if (!updated) throw createError({ statusCode: 404, statusMessage: 'Application not found' })

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: body.status && body.status !== current.status ? 'status_changed' : 'updated',
    resourceType: 'application',
    resourceId: id,
    metadata: body.status && body.status !== current.status
      ? { from: current.status, to: body.status }
      : undefined,
  })

  if (body.status && body.status !== current.status) {
    trackEvent(event, session, 'application status_changed', {
      application_id: id,
      job_id: updated.jobId,
      from_status: current.status,
      to_status: body.status,
    })

    logApiRequest(event, session, 'application.status_changed', {
      application_id: id,
      job_id: updated.jobId,
      from_status: current.status,
      to_status: body.status,
    })
  }

  return updated
})
