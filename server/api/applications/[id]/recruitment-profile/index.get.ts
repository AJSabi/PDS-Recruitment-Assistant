import { and, eq } from 'drizzle-orm'
import { recruitmentApplicationProfile, recruiterScreeningSession } from '../../../../database/schema'
import { assertApplicationAccess } from '../../../../utils/recruitmentVisibility'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['read'] })
  const orgId = session.session.activeOrganizationId
  const { id: applicationId } = await getValidatedRouterParams(event, paramsSchema.parse)
  await assertApplicationAccess(orgId, session.user.id, applicationId)

  const [profile, screening] = await Promise.all([
    db.query.recruitmentApplicationProfile.findFirst({
      where: and(eq(recruitmentApplicationProfile.applicationId, applicationId), eq(recruitmentApplicationProfile.organizationId, orgId)),
    }),
    db.query.recruiterScreeningSession.findFirst({
      where: and(eq(recruiterScreeningSession.applicationId, applicationId), eq(recruiterScreeningSession.organizationId, orgId)),
      columns: { status: true, recommendedNextStep: true },
    }),
  ])

  if (!profile) {
    return {
      profile: {
        applicationId,
        currentFit: 'not_yet_assessed',
        lastStatus: 'candidate_added',
        nextAction: 'Upload or verify the latest resume.',
        selectedResumeDocumentId: null,
        assessmentLocked: false,
        requirementVersionAssessed: 0,
      },
    }
  }

  // Compatibility recovery for sessions completed before the profile-stage sync was
  // hardened. Do not rewrite history on GET; project Reassess only when the stored
  // screening itself explicitly recommends it and the candidate has not progressed
  // beyond recruiter screening.
  const historicalReassess = screening?.status === 'completed'
    && screening.recommendedNextStep === 'reassess'
    && ['resume_reviewed', 'recruiter_screening_pending', 'recruiter_screening_completed'].includes(profile.lastStatus)

  return {
    profile: historicalReassess
      ? { ...profile, lastStatus: 'reassess', nextAction: 'Revalidate recruiter screening', historicalStageRecovery: true }
      : profile,
  }
})
