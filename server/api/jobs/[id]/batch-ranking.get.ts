import { and, eq, inArray } from 'drizzle-orm'
import { application, candidate, recruitmentApplicationProfile, recruitmentRequirementState, resumeAssessment } from '../../../database/schema'
import { assertRequirementAccess } from '../../../utils/recruitmentVisibility'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['read'] })
  const orgId = session.session.activeOrganizationId
  const { id: jobId } = await getValidatedRouterParams(event, paramsSchema.parse)
  await assertRequirementAccess(orgId, session.user.id, jobId)

  const requirementState = await db.query.recruitmentRequirementState.findFirst({
    where: and(eq(recruitmentRequirementState.organizationId, orgId), eq(recruitmentRequirementState.jobId, jobId)),
  })
  const requirementRevision = requirementState?.revision ?? 1

  const apps = await db.select({
    applicationId: application.id,
    candidateId: application.candidateId,
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    email: candidate.email,
  }).from(application)
    .innerJoin(candidate, eq(candidate.id, application.candidateId))
    .where(and(eq(application.organizationId, orgId), eq(application.jobId, jobId)))

  if (!apps.length) {
    return {
      jobId,
      requirementRevision,
      minimumVisibleMatch: null,
      ranking: [],
      advisoryOnly: true,
      note: 'AI assessment is advisory. No candidate is hidden, ranked or excluded by an AI score.',
    }
  }
  const appIds = apps.map(a => a.applicationId)

  const profiles = await db.select().from(recruitmentApplicationProfile)
    .where(and(eq(recruitmentApplicationProfile.organizationId, orgId), inArray(recruitmentApplicationProfile.applicationId, appIds)))
  const assessments = await db.select().from(resumeAssessment)
    .where(and(eq(resumeAssessment.organizationId, orgId), inArray(resumeAssessment.applicationId, appIds)))

  const profileMap = new Map(profiles.map(p => [p.applicationId, p]))
  const assessmentMap = new Map(assessments.map(a => [a.applicationId, a]))

  // Keep the legacy response key for compatibility, but return a neutral candidate list.
  // Ordering is alphabetical only; AI score/priority never controls visibility or order.
  const ranking = apps.map((app) => {
    const profile = profileMap.get(app.applicationId)
    const assessment = assessmentMap.get(app.applicationId)
    const assessedRevision = profile?.requirementVersionAssessed ?? 0
    const needsReassessment = assessedRevision > 0 && assessedRevision < requirementRevision

    return {
      rank: null,
      applicationId: app.applicationId,
      candidateId: app.candidateId,
      candidate: `${app.firstName} ${app.lastName}`.trim(),
      email: app.email,
      provisionalFitScore: assessment?.provisionalFitScore ?? profile?.provisionalFitScore ?? null,
      mandatoryMatch: assessment?.mandatoryMatch ?? profile?.mandatoryMatch ?? null,
      keyStrength: assessment?.keyStrength ?? profile?.keyStrength ?? null,
      mainGap: assessment?.mainGap ?? profile?.mainGap ?? null,
      priority: assessment?.priority ?? profile?.priority ?? null,
      currentFit: profile?.currentFit ?? 'not_yet_assessed',
      lastStatus: profile?.lastStatus ?? 'candidate_added',
      nextAction: profile?.nextAction ?? 'Open recruitment workflow',
      statusDate: profile?.statusDate ?? null,
      selectedResume: Boolean(profile?.selectedResumeDocumentId),
      assessmentLocked: profile?.assessmentLocked ?? false,
      assessed: Boolean(assessment),
      assessedRevision,
      requirementRevision,
      needsReassessment,
    }
  }).sort((a, b) => a.candidate.localeCompare(b.candidate) || a.applicationId.localeCompare(b.applicationId))

  return {
    jobId,
    requirementRevision,
    minimumVisibleMatch: null,
    ranking,
    advisoryOnly: true,
    note: 'AI assessment is advisory. No candidate is hidden, ranked or excluded by an AI score.',
  }
})