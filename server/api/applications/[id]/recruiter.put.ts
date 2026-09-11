import { z } from 'zod'
import { assertApplicationAccess, assertRecruitmentAdmin } from '../../../utils/recruitmentVisibility'

const paramsSchema = z.object({ id: z.string().min(1) })
const bodySchema = z.object({ recruiterUserId: z.string().min(1).nullable() }).strict()

/**
 * Candidate-level recruiter reassignment is intentionally retired.
 * Requirement allocation is the single source of truth and cascades to every
 * recruitment application under the requirement.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['update'] })
  const orgId = session.session.activeOrganizationId
  await assertRecruitmentAdmin(orgId, session.user.id)

  const { id: applicationId } = await getValidatedRouterParams(event, paramsSchema.parse)
  await assertApplicationAccess(orgId, session.user.id, applicationId)
  await readValidatedBody(event, bodySchema.parse)

  throw createError({
    statusCode: 409,
    statusMessage: 'Recruiter ownership is controlled by Requirement Allocation. Reassign the requirement to transfer all of its candidates together.',
  })
})
