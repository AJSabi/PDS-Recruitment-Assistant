import { and, eq } from 'drizzle-orm'
import { jobSkillMatrix } from '../../../../database/schema'
import { assertRequirementAccess } from '../../../../utils/recruitmentVisibility'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { scoring: ['read'] })
  const orgId = session.session.activeOrganizationId
  const { id: jobId } = await getValidatedRouterParams(event, paramsSchema.parse)
  await assertRequirementAccess(orgId, session.user.id, jobId)

  const record = await db.query.jobSkillMatrix.findFirst({
    where: and(eq(jobSkillMatrix.jobId, jobId), eq(jobSkillMatrix.organizationId, orgId)),
    columns: {
      majorSkills: true,
      booleanSearch: true,
      booleanSearchFeedback: true,
      sourcingGeneratedAt: true,
      sourcingUpdatedBy: true,
      approvedAt: true,
    },
  })

  return {
    majorSkills: record?.majorSkills ?? [],
    booleanSearch: record?.booleanSearch ?? '',
    recruiterFeedback: record?.booleanSearchFeedback ?? '',
    generatedAt: record?.sourcingGeneratedAt ?? null,
    updatedBy: record?.sourcingUpdatedBy ?? null,
    skillMatrixApproved: Boolean(record?.approvedAt),
  }
})
