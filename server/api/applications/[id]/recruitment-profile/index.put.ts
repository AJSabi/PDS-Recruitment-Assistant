import { and, eq } from 'drizzle-orm'
import { recruitmentApplicationProfile } from '../../../../database/schema'
import { updateRecruitmentProfileSchema } from '../../../../utils/schemas/recruitmentWorkflow'
import { assertApplicationAccess } from '../../../../utils/recruitmentVisibility'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { id: applicationId } = await getValidatedRouterParams(event, paramsSchema.parse)
  await assertApplicationAccess(orgId, session.user.id, applicationId)
  const body = await readValidatedBody(event, updateRecruitmentProfileSchema.parse)

  const existing = await db.query.recruitmentApplicationProfile.findFirst({
    where: and(eq(recruitmentApplicationProfile.applicationId, applicationId), eq(recruitmentApplicationProfile.organizationId, orgId)),
  })

  const now = new Date()
  const values = { ...body, lastUpdatedBy: session.user.id, updatedAt: now }

  let profile
  if (existing) {
    ;[profile] = await db.update(recruitmentApplicationProfile).set(values).where(eq(recruitmentApplicationProfile.id, existing.id)).returning()
  } else {
    ;[profile] = await db.insert(recruitmentApplicationProfile).values({ organizationId: orgId, applicationId, currentFit: 'not_yet_assessed', lastStatus: 'candidate_added', ...values }).returning()
  }

  return { profile }
})
