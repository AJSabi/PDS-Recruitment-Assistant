import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { ssoProvider } from '~~/server/database/schema'
import { assertRecruitmentAdmin } from '~~/server/utils/recruitmentVisibility'

const deleteSsoSchema = z.object({ id: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { organization: ['update'] })
  const orgId = session.session.activeOrganizationId
  await assertRecruitmentAdmin(orgId, session.user.id)

  const { id } = await getValidatedRouterParams(event, deleteSsoSchema.parse)
  const [deleted] = await db.delete(ssoProvider)
    .where(and(eq(ssoProvider.id, id), eq(ssoProvider.organizationId, orgId)))
    .returning({ id: ssoProvider.id })

  if (!deleted) throw createError({ statusCode: 404, statusMessage: 'SSO provider not found' })
  return { success: true }
})
