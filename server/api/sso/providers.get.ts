import { eq } from 'drizzle-orm'
import { ssoProvider } from '~~/server/database/schema'
import { assertRecruitmentAdmin } from '~~/server/utils/recruitmentVisibility'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { organization: ['update'] })
  const orgId = session.session.activeOrganizationId
  await assertRecruitmentAdmin(orgId, session.user.id)

  return db.select({
    id: ssoProvider.id,
    providerId: ssoProvider.providerId,
    issuer: ssoProvider.issuer,
    domain: ssoProvider.domain,
    organizationId: ssoProvider.organizationId,
  }).from(ssoProvider).where(eq(ssoProvider.organizationId, orgId))
})
