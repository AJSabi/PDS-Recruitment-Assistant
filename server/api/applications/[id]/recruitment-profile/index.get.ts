import { and, eq } from 'drizzle-orm'
import { recruitmentApplicationProfile } from '../../../../database/schema'
import { assertApplicationAccess } from '../../../../utils/recruitmentVisibility'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['read'] })
  const orgId = session.session.activeOrganizationId
  const { id: applicationId } = await getValidatedRouterParams(event, paramsSchema.parse)
  await assertApplicationAccess(orgId, session.user.id, applicationId)

  const profile = await db.query.recruitmentApplicationProfile.findFirst({
    where: and(eq(recruitmentApplicationProfile.applicationId, applicationId), eq(recruitmentApplicationProfile.organizationId, orgId)),
  })

  return {
    profile: profile ?? {
      applicationId,
      currentFit: 'not_yet_assessed',
      lastStatus: 'candidate_added',
      nextAction: 'Upload or verify the latest resume.',
      selectedResumeDocumentId: null,
      assessmentLocked: false,
      requirementVersionAssessed: 0,
    },
  }
})
