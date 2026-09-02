import { and, eq } from 'drizzle-orm'
import { member, user } from '../../database/schema/auth'
import { assertRecruitmentAdmin } from '../../utils/recruitmentVisibility'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['read'] })
  const orgId = session.session.activeOrganizationId
  await assertRecruitmentAdmin(orgId, session.user.id)

  const recruiters = await db.select({
    id: user.id,
    name: user.name,
    email: user.email,
    role: member.role,
  })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, orgId))
    .orderBy(user.name)

  return { recruiters }
})
