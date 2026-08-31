import { eq, and } from 'drizzle-orm'
import { job } from '../../database/schema'
import { idParamSchema } from '../../utils/schemas/job'
import { canAccessRequirement } from '../../utils/recruitmentVisibility'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { job: ['read'] })
  const orgId = session.session.activeOrganizationId
  const userId = session.user.id

  const { id } = await getValidatedRouterParams(event, idParamSchema.parse)

  const allowed = await canAccessRequirement(orgId, userId, id)
  if (!allowed) {
    throw createError({ statusCode: 404, statusMessage: 'Requirement not found' })
  }

  const result = await db.query.job.findFirst({
    where: and(eq(job.id, id), eq(job.organizationId, orgId)),
    columns: {
      id: true,
      title: true,
      slug: true,
      description: true,
      location: true,
      type: true,
      status: true,
      salaryMin: true,
      salaryMax: true,
      salaryCurrency: true,
      salaryUnit: true,
      salaryNegotiable: true,
      remoteStatus: true,
      validThrough: true,
      phoneRequirement: true,
      requireResume: true,
      requireCoverLetter: true,
      autoScoreOnApply: true,
      experienceLevel: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  if (!result) {
    throw createError({ statusCode: 404, statusMessage: 'Requirement not found' })
  }

  return result
})
