import { and, eq } from 'drizzle-orm'
import { application, recruitmentApplicationProfile } from '../../../../database/schema'
import { updateRecruitmentProfileSchema } from '../../../../utils/schemas/recruitmentWorkflow'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { id: applicationId } = await getValidatedRouterParams(event, paramsSchema.parse)
  const body = await readValidatedBody(event, updateRecruitmentProfileSchema.parse)

  const app = await db.query.application.findFirst({
    where: and(eq(application.id, applicationId), eq(application.organizationId, orgId)),
    columns: { id: true },
  })
  if (!app) throw createError({ statusCode: 404, statusMessage: 'Application not found' })

  const existing = await db.query.recruitmentApplicationProfile.findFirst({
    where: and(eq(recruitmentApplicationProfile.applicationId, applicationId), eq(recruitmentApplicationProfile.organizationId, orgId)),
  })

  const now = new Date()
  const values = {
    ...body,
    lastUpdatedBy: session.user.id,
    updatedAt: now,
    ...(body.lastStatus ? { statusDate: now } : {}),
  }

  let profile
  if (existing) {
    ;[profile] = await db.update(recruitmentApplicationProfile)
      .set(values)
      .where(eq(recruitmentApplicationProfile.id, existing.id))
      .returning()
  } else {
    ;[profile] = await db.insert(recruitmentApplicationProfile)
      .values({
        organizationId: orgId,
        applicationId,
        currentFit: body.currentFit ?? 'not_yet_assessed',
        lastStatus: body.lastStatus ?? 'resume_received',
        ...values,
      })
      .returning()
  }

  return { profile }
})
