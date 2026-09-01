import { eq, and } from 'drizzle-orm'
import { application, applicationSource, job, recruitmentApplicationProfile, recruitmentRequirementState } from '../../database/schema'
import { createApplicationSchema } from '../../utils/schemas/application'
import { findActiveCandidate } from '../../utils/candidate-retention'
import { applicationSourcePersistence } from '../../utils/recruitmentSource'
import { assertRequirementAccess } from '../../utils/recruitmentVisibility'

/**
 * POST /api/applications
 * Legacy compatibility route. Creation is allowed only against a requirement
 * visible to the current recruiter under the PDS allocation model and inherits
 * the requirement's authoritative recruiter allocation.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['create'] })
  const orgId = session.session.activeOrganizationId

  const body = await readValidatedBody(event, createApplicationSchema.parse)
  await assertRequirementAccess(orgId, session.user.id, body.jobId)

  const existingCandidate = await findActiveCandidate(orgId, body.candidateId)
  if (!existingCandidate) throw createError({ statusCode: 409, statusMessage: 'Candidate is quarantined or not found' })

  const [existingJob, requirementState] = await Promise.all([
    db.query.job.findFirst({
      where: and(eq(job.id, body.jobId), eq(job.organizationId, orgId)),
      columns: { id: true },
    }),
    db.query.recruitmentRequirementState.findFirst({
      where: and(eq(recruitmentRequirementState.organizationId, orgId), eq(recruitmentRequirementState.jobId, body.jobId)),
      columns: { ownerUserId: true },
    }),
  ])
  if (!existingJob) throw createError({ statusCode: 404, statusMessage: 'Requirement not found' })

  const existing = await db.query.application.findFirst({
    where: and(eq(application.organizationId, orgId), eq(application.candidateId, body.candidateId), eq(application.jobId, body.jobId)),
    columns: { id: true },
  })
  if (existing) throw createError({ statusCode: 409, statusMessage: 'This candidate is already in recruitment for this requirement' })

  const [created] = await db.insert(application).values({
    organizationId: orgId,
    candidateId: body.candidateId,
    jobId: body.jobId,
    notes: body.notes,
    status: 'new',
  }).returning({
    id: application.id,
    candidateId: application.candidateId,
    jobId: application.jobId,
    status: application.status,
    score: application.score,
    notes: application.notes,
    createdAt: application.createdAt,
    updatedAt: application.updatedAt,
  })
  if (!created) throw createError({ statusCode: 500, statusMessage: 'Failed to create application' })

  const sourcePersistence = applicationSourcePersistence('recruiter_sourcing')
  await db.insert(applicationSource).values({
    organizationId: orgId,
    applicationId: created.id,
    channel: sourcePersistence.channel,
    utmSource: sourcePersistence.utmSource,
  })

  await db.insert(recruitmentApplicationProfile).values({
    organizationId: orgId,
    applicationId: created.id,
    assignedRecruiterId: requirementState?.ownerUserId ?? null,
    currentFit: 'not_yet_assessed',
    lastStatus: 'candidate_added',
    assessmentLocked: false,
    nextAction: 'Upload or verify the latest resume.',
    lastUpdatedBy: session.user.id,
  })

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'created',
    resourceType: 'application',
    resourceId: created.id,
    metadata: { candidateId: body.candidateId, jobId: body.jobId, assignedRecruiterId: requirementState?.ownerUserId ?? null, source: 'recruiter_sourcing' },
  })

  setResponseStatus(event, 201)
  return created
})