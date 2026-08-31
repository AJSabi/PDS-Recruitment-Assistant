import { and, eq } from 'drizzle-orm'
import { jobSkillMatrix } from '../../../../database/schema'
import { assertRequirementAccess } from '../../../../utils/recruitmentVisibility'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })
const bodySchema = z.object({
  majorSkills: z.array(z.string().trim().min(1).max(160)).max(12),
  booleanSearch: z.string().trim().max(3000),
  recruiterFeedback: z.string().trim().max(1200).optional().default(''),
})

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { scoring: ['create'] })
  const orgId = session.session.activeOrganizationId
  const { id: jobId } = await getValidatedRouterParams(event, paramsSchema.parse)
  await assertRequirementAccess(orgId, session.user.id, jobId)
  const body = await readValidatedBody(event, bodySchema.parse)

  const existing = await db.query.jobSkillMatrix.findFirst({
    where: and(eq(jobSkillMatrix.jobId, jobId), eq(jobSkillMatrix.organizationId, orgId)),
    columns: { id: true },
  })
  if (!existing) throw createError({ statusCode: 422, statusMessage: 'Save or generate the Skill Matrix before saving sourcing aids.' })

  const now = new Date()
  const [saved] = await db.update(jobSkillMatrix).set({
    majorSkills: body.majorSkills,
    booleanSearch: body.booleanSearch || null,
    booleanSearchFeedback: body.recruiterFeedback || null,
    sourcingUpdatedBy: session.user.id,
    updatedAt: now,
  }).where(eq(jobSkillMatrix.id, existing.id)).returning({
    majorSkills: jobSkillMatrix.majorSkills,
    booleanSearch: jobSkillMatrix.booleanSearch,
    booleanSearchFeedback: jobSkillMatrix.booleanSearchFeedback,
    sourcingGeneratedAt: jobSkillMatrix.sourcingGeneratedAt,
  })

  return {
    majorSkills: saved?.majorSkills ?? body.majorSkills,
    booleanSearch: saved?.booleanSearch ?? body.booleanSearch,
    recruiterFeedback: saved?.booleanSearchFeedback ?? body.recruiterFeedback,
    generatedAt: saved?.sourcingGeneratedAt ?? null,
    source: 'recruiter',
  }
})
