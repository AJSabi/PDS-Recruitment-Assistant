import { and, eq, isNull } from 'drizzle-orm'
import { application, applicationSource, candidate, job, recruitmentApplicationProfile, recruitmentRequirementState } from '../../../database/schema'
import { candidateIntakeSchema } from '../../../utils/schemas/candidateIntake'
import { applicationSourcePersistence } from '../../../utils/recruitmentSource'
import { assertRequirementAccess } from '../../../utils/recruitmentVisibility'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['create'], candidate: ['create'] })
  const orgId = session.session.activeOrganizationId
  const { id: jobId } = await getValidatedRouterParams(event, paramsSchema.parse)
  await assertRequirementAccess(orgId, session.user.id, jobId)
  const body = await readValidatedBody(event, candidateIntakeSchema.parse)

  const [existingJob, requirementState] = await Promise.all([
    db.query.job.findFirst({
      where: and(eq(job.id, jobId), eq(job.organizationId, orgId)),
      columns: { id: true, title: true },
    }),
    db.query.recruitmentRequirementState.findFirst({
      where: and(eq(recruitmentRequirementState.organizationId, orgId), eq(recruitmentRequirementState.jobId, jobId)),
      columns: { ownerUserId: true },
    }),
  ])
  if (!existingJob) throw createError({ statusCode: 404, statusMessage: 'Requirement not found' })

  let candidateId = body.candidateId
  let candidateRecord: { id: string; firstName: string; lastName: string; email: string } | undefined

  if (candidateId) {
    candidateRecord = await db.query.candidate.findFirst({
      where: and(eq(candidate.id, candidateId), eq(candidate.organizationId, orgId), isNull(candidate.quarantinedAt)),
      columns: { id: true, firstName: true, lastName: true, email: true },
    })
    if (!candidateRecord) throw createError({ statusCode: 409, statusMessage: 'Candidate is quarantined or not found' })
  } else {
    const email = body.email!
    const matchedByEmail = await db.query.candidate.findFirst({
      where: and(eq(candidate.organizationId, orgId), eq(candidate.email, email)),
      columns: { id: true, firstName: true, lastName: true, email: true, quarantinedAt: true },
    })
    const matchedByPhone = !matchedByEmail && body.phone
      ? await db.query.candidate.findFirst({
          where: and(eq(candidate.organizationId, orgId), eq(candidate.phone, body.phone)),
          columns: { id: true, firstName: true, lastName: true, email: true, quarantinedAt: true },
        })
      : undefined
    const matchedCandidate = matchedByEmail ?? matchedByPhone

    if (matchedCandidate?.quarantinedAt) {
      throw createError({ statusCode: 409, statusMessage: 'A matching candidate is in retention quarantine and cannot be linked through recruiter intake.' })
    }

    if (matchedCandidate) {
      candidateRecord = { id: matchedCandidate.id, firstName: matchedCandidate.firstName, lastName: matchedCandidate.lastName, email: matchedCandidate.email }
    } else {
      const [createdCandidate] = await db.insert(candidate).values({
        organizationId: orgId,
        firstName: body.firstName!,
        lastName: body.lastName ?? '',
        email,
        phone: body.phone,
      }).returning({ id: candidate.id, firstName: candidate.firstName, lastName: candidate.lastName, email: candidate.email })
      if (!createdCandidate) throw createError({ statusCode: 500, statusMessage: 'Failed to create candidate' })
      candidateRecord = createdCandidate
    }
    candidateId = candidateRecord.id
  }

  const duplicate = await db.query.application.findFirst({
    where: and(eq(application.organizationId, orgId), eq(application.candidateId, candidateId), eq(application.jobId, jobId)),
    columns: { id: true },
  })

  if (duplicate) {
    const profile = await db.query.recruitmentApplicationProfile.findFirst({
      where: and(eq(recruitmentApplicationProfile.applicationId, duplicate.id), eq(recruitmentApplicationProfile.organizationId, orgId)),
    })
    if (profile && requirementState?.ownerUserId && profile.assignedRecruiterId !== requirementState.ownerUserId) {
      await db.update(recruitmentApplicationProfile).set({ assignedRecruiterId: requirementState.ownerUserId, updatedAt: new Date() }).where(eq(recruitmentApplicationProfile.id, profile.id))
    }
    return {
      created: false,
      candidate: candidateRecord,
      applicationId: duplicate.id,
      recruitmentProfileId: profile?.id ?? null,
      nextStep: profile?.lastStatus === 'candidate_added' ? 'upload_resume' : 'continue_workflow',
    }
  }

  const [createdApplication] = await db.insert(application).values({
    organizationId: orgId,
    candidateId,
    jobId,
    notes: body.notes,
    status: 'new',
  }).returning({ id: application.id })
  if (!createdApplication) throw createError({ statusCode: 500, statusMessage: 'Failed to create application' })

  const sourcePersistence = applicationSourcePersistence(body.source)
  await db.insert(applicationSource).values({
    organizationId: orgId,
    applicationId: createdApplication.id,
    channel: sourcePersistence.channel,
    utmSource: sourcePersistence.utmSource,
  })

  const [profile] = await db.insert(recruitmentApplicationProfile).values({
    organizationId: orgId,
    applicationId: createdApplication.id,
    assignedRecruiterId: requirementState?.ownerUserId ?? null,
    currentFit: 'not_yet_assessed',
    lastStatus: 'candidate_added',
    statusDate: new Date(),
    nextAction: 'Upload or verify the latest resume.',
    lastUpdatedBy: session.user.id,
  }).returning({ id: recruitmentApplicationProfile.id })

  recordActivity({
    organizationId: orgId,
    actorId: session.user.id,
    action: 'created',
    resourceType: 'application',
    resourceId: createdApplication.id,
    metadata: {
      event: 'candidate_intake_created',
      candidateId,
      jobId,
      candidateEmail: candidateRecord.email,
      assignedRecruiterId: requirementState?.ownerUserId ?? null,
      source: body.source,
      dedupeOrder: 'email_then_phone',
    },
  })

  setResponseStatus(event, 201)
  return {
    created: true,
    candidate: candidateRecord,
    applicationId: createdApplication.id,
    recruitmentProfileId: profile?.id ?? null,
    source: body.source,
    nextStep: 'upload_resume',
  }
})