import { getRequirementVisibility } from '../utils/recruitmentVisibility'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { job: ['read'] })
  const orgId = session.session.activeOrganizationId
  const visibility = await getRequirementVisibility(orgId, session.user.id)

  return {
    role: visibility.role,
    canManageRequirements: visibility.canSeeAll,
    allocatedOnly: !visibility.canSeeAll,
  }
})
