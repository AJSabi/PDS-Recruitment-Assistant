import { and, eq, isNull } from 'drizzle-orm'
import { activityLog, application, applicationSource, candidate, job, recruitmentApplicationProfile, recruitmentRequirementState } from '../../../database/schema'
import { candidateIntakeSchema } from '../../../utils/schemas/candidateIntake'
import { findCandidateIdentityConflicts } from '../../../utils/candidateIdentityConflict'
import { findCandidateIdentityMatch, normalizeCandidateEmail, normalizeCandidatePhone } from '../../../utils/candidateIdentityMatch'
import { applicationSourcePersistence } from '../../../utils/recruitmentSource'
import { assertRequirementAccess } from '../../../utils/recruitmentVisibility'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })

type CandidateRecord = {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
}

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['create'], candidate: ['create'] })
  const orgId = session.session.activeOrganizationId
  const { id: jobId } = await getValidatedRouterParams(event, paramsSchema.parse)
  await assertRequirementAccess(orgId, session.user.id, jobId)
  const body = await readValidatedBody(event, candidateIntakeSchema.parse)

  if (body.identityConflictResolution) {
    await requirePermission(event, { candidate: ['update'] })
  }

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

  const sourcePersistence = applicationSourcePersistence(body.source)
  let candidateRecord: CandidateRecord
  let candidateId: string
  let resolutionAudit: {
    matchBasis: 'email' | 'phone'
    conflictFields: Array<'name' | 'email' | 'phone'>
    refreshedFields: Array<'name' | 'email' | 'phone'>
    reviewedIdentity: {
      firstName: string
      lastName: string
      email: string
      phone: string | null
    }
  } | null = null

  if (body.candidateId) {
    const existingCandidate = await db.query.candidate.findFirst({
      where: and(eq(candidate.id, body.candidateId), eq(candidate.organizationId, orgId), isNull(candidate.quarantinedAt)),
      columns: { id: true, firstName: true, lastName: true, email: true, phone: true },
    })
    if (!existingCandidate) throw createError({ statusCode: 409, statusMessage: 'Candidate is quarantined or not found' })

    candidateRecord = existingCandidate
    candidateId = existingCandidate.id

    if (body.identityConflictResolution) {
      const reviewed = body.identityConflictResolution.reviewedIdentity
      const reviewedIdentity = {
        firstName: reviewed.firstName,
        lastName: reviewed.lastName ?? '',
        email: reviewed.email,
        phone: reviewed.phone ?? null,
      }

      const emailMatches = normalizeCandidateEmail(existingCandidate.email) === normalizeCandidateEmail(reviewedIdentity.email)
      const phoneMatches = Boolean(normalizeCandidatePhone(existingCandidate.phone))
        && normalizeCandidatePhone(existingCandidate.phone) === normalizeCandidatePhone(reviewedIdentity.phone)
      const matchBasis: 'email' | 'phone' | null = emailMatches ? 'email' : phoneMatches ? 'phone' : null

      if (!matchBasis) {
        throw createError({
          statusCode: 409,
          statusMessage: 'The selected Candidate Database record no longer matches the reviewed email or phone. Run the duplicate check again.',
        })
      }

      const conflicts = findCandidateIdentityConflicts(existingCandidate, reviewedIdentity)
      const conflictFields = conflicts.map(conflict => conflict.field)
      if (conflictFields.length === 0) {
        throw createError({
          statusCode: 409,
          statusMessage: 'The Candidate Database identity changed while you were reviewing it. Run the duplicate check again before confirming.',
        })
      }

      const refreshedFields = body.identityConflictResolution.refreshedFields
      const invalidRefreshField = refreshedFields.find(field => !conflictFields.includes(field))
      if (invalidRefreshField) {
        throw createError({
          statusCode: 422,
          statusMessage: `Cannot refresh ${invalidRefreshField}; that field is not part of the current identity conflict.`,
        })
      }

      if (refreshedFields.includes('email') && normalizeCandidateEmail(reviewedIdentity.email) !== normalizeCandidateEmail(existingCandidate.email)) {
        const duplicateEmailMatch = await findCandidateIdentityMatch(
          orgId,
          { email: reviewedIdentity.email },
          { excludeCandidateId: candidateId },
        )
        if (duplicateEmailMatch?.basis === 'email') {
          throw createError({ statusCode: 409, statusMessage: 'A candidate with this email already exists' })
        }
      }

      resolutionAudit = {
        matchBasis,
        conflictFields,
        refreshedFields,
        reviewedIdentity,
      }
    }
  } else {
    const email = body.email!
    const match = await findCandidateIdentityMatch(orgId, { email, phone: body.phone })
    const matchedCandidate = match?.candidate

    if (matchedCandidate?.quarantinedAt) {
      throw createError({ statusCode: 409, statusMessage: 'A matching candidate is in retention quarantine and cannot be linked through recruiter intake.' })
    }

    if (matchedCandidate) {
      const identityConflicts = findCandidateIdentityConflicts(matchedCandidate, body)
      if (identityConflicts.length) {
        throw createError({
          statusCode: 409,
          statusMessage: 'A Candidate Database record matches this email or phone, but its identity details differ. Review the conflict and explicitly use the existing candidate record instead of creating a new identity.',
        })
      }
      candidateRecord = {
        id: matchedCandidate.id,
        firstName: matchedCandidate.firstName,
        lastName: matchedCandidate.lastName,
        email: matchedCandidate.email,
        phone: matchedCandidate.phone,
      }
      candidateId = matchedCandidate.id
    } else {
      candidateId = crypto.randomUUID()
      candidateRecord = {
        id: candidateId,
        firstName: body.firstName!,
        lastName: body.lastName ?? '',
        email,
        phone: body.phone ?? null,
      }
    }
  }

  const result = await db.transaction(async (tx) => {
    const existingCandidateInDb = await tx.select({ id: candidate.id })
      .from(candidate)
      .where(and(eq(candidate.id, candidateId), eq(candidate.organizationId, orgId)))
      .limit(1)

    if (existingCandidateInDb.length === 0) {
      await tx.insert(candidate).values({
        id: candidateId,
        organizationId: orgId,
        firstName: candidateRecord.firstName,
        lastName: candidateRecord.lastName,
        email: candidateRecord.email,
        phone: candidateRecord.phone,
      })
    } else if (resolutionAudit) {
      const updates: Record<string, string | null | Date> = { updatedAt: new Date() }
      if (resolutionAudit.refreshedFields.includes('name')) {
        updates.firstName = resolutionAudit.reviewedIdentity.firstName
        updates.lastName = resolutionAudit.reviewedIdentity.lastName
        candidateRecord.firstName = resolutionAudit.reviewedIdentity.firstName
        candidateRecord.lastName = resolutionAudit.reviewedIdentity.lastName
      }
      if (resolutionAudit.refreshedFields.includes('email')) {
        updates.email = resolutionAudit.reviewedIdentity.email
        candidateRecord.email = resolutionAudit.reviewedIdentity.email
      }
      if (resolutionAudit.refreshedFields.includes('phone')) {
        updates.phone = resolutionAudit.reviewedIdentity.phone
        candidateRecord.phone = resolutionAudit.reviewedIdentity.phone
      }
      if (Object.keys(updates).length > 1) {
        await tx.update(candidate)
          .set(updates)
          .where(and(eq(candidate.id, candidateId), eq(candidate.organizationId, orgId)))
      }
    }

    const [duplicate] = await tx.select({ id: application.id })
      .from(application)
      .where(and(eq(application.organizationId, orgId), eq(application.candidateId, candidateId), eq(application.jobId, jobId)))
      .limit(1)

    if (duplicate) {
      const [profile] = await tx.select()
        .from(recruitmentApplicationProfile)
        .where(and(eq(recruitmentApplicationProfile.applicationId, duplicate.id), eq(recruitmentApplicationProfile.organizationId, orgId)))
        .limit(1)

      if (profile && requirementState?.ownerUserId && profile.assignedRecruiterId !== requirementState.ownerUserId) {
        await tx.update(recruitmentApplicationProfile)
          .set({ assignedRecruiterId: requirementState.ownerUserId, updatedAt: new Date() })
          .where(eq(recruitmentApplicationProfile.id, profile.id))
      }

      if (resolutionAudit) {
        await tx.insert(activityLog).values({
          organizationId: orgId,
          actorId: session.user.id,
          action: 'updated',
          resourceType: 'candidate',
          resourceId: candidateId,
          metadata: {
            event: 'identity_conflict_resolved',
            confirmation: true,
            matchBasis: resolutionAudit.matchBasis,
            conflictFields: resolutionAudit.conflictFields,
            refreshedFields: resolutionAudit.refreshedFields,
            source: 'candidate_identity_review',
            applicationId: duplicate.id,
            jobId,
          },
        })
      }

      return {
        created: false as const,
        applicationId: duplicate.id,
        recruitmentProfileId: profile?.id ?? null,
        nextStep: profile?.lastStatus === 'candidate_added' ? 'upload_resume' : 'continue_workflow',
      }
    }

    const [createdApplication] = await tx.insert(application).values({
      organizationId: orgId,
      candidateId,
      jobId,
      notes: body.notes,
      status: 'new',
    }).returning({ id: application.id })
    if (!createdApplication) throw new Error('Failed to create application')

    await tx.insert(applicationSource).values({
      organizationId: orgId,
      applicationId: createdApplication.id,
      channel: sourcePersistence.channel,
      utmSource: sourcePersistence.utmSource,
    })

    const [profile] = await tx.insert(recruitmentApplicationProfile).values({
      organizationId: orgId,
      applicationId: createdApplication.id,
      assignedRecruiterId: requirementState?.ownerUserId ?? null,
      currentFit: 'not_yet_assessed',
      lastStatus: 'candidate_added',
      statusDate: new Date(),
      nextAction: 'Upload or verify the latest resume.',
      lastUpdatedBy: session.user.id,
    }).returning({ id: recruitmentApplicationProfile.id })

    if (resolutionAudit) {
      await tx.insert(activityLog).values({
        organizationId: orgId,
        actorId: session.user.id,
        action: 'updated',
        resourceType: 'candidate',
        resourceId: candidateId,
        metadata: {
          event: 'identity_conflict_resolved',
          confirmation: true,
          matchBasis: resolutionAudit.matchBasis,
          conflictFields: resolutionAudit.conflictFields,
          refreshedFields: resolutionAudit.refreshedFields,
          source: 'candidate_identity_review',
          applicationId: createdApplication.id,
          jobId,
        },
      })
    }

    return {
      created: true as const,
      applicationId: createdApplication.id,
      recruitmentProfileId: profile?.id ?? null,
      nextStep: 'upload_resume' as const,
    }
  })

  if (result.created) {
    recordActivity({
      organizationId: orgId,
      actorId: session.user.id,
      action: 'created',
      resourceType: 'application',
      resourceId: result.applicationId,
      metadata: {
        event: 'candidate_intake_created',
        candidateId,
        jobId,
        assignedRecruiterId: requirementState?.ownerUserId ?? null,
        source: body.source,
        dedupeOrder: 'email_then_phone',
      },
    })
    setResponseStatus(event, 201)
  }

  return {
    created: result.created,
    candidate: candidateRecord,
    applicationId: result.applicationId,
    recruitmentProfileId: result.recruitmentProfileId,
    ...(result.created ? { source: body.source } : {}),
    nextStep: result.nextStep,
  }
})
