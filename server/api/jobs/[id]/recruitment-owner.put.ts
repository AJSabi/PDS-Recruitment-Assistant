import { and, eq } from 'drizzle-orm'
import { job } from '../../../database/schema/app'
import { member } from '../../../database/schema/auth'
import { recruitmentRequirementState } from '../../../database/schema/recruitmentWorkflow'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })
const bodySchema = z.object({ ownerUserId: z.string().min(1).nullable() }).strict()

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { job: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { id: jobId } = await getValidatedRouterParams(event, paramsSchema.parse)
  const body = await readValidatedBody(event, bodySchema.parse)

  const requirement = await db.query.job.findFirst({
    where: and(eq(job.id, jobId), eq(job.organizationId, orgId)),
    columns: { id: true },
  })
  if (!requirement) throw createError({ statusCode: 404, statusMessage: 'Requirement not found' })

  if (body.ownerUserId) {
    const orgMember = await db.query.member.findFirst({
      where: and(eq(member.organizationId, orgId), eq(member.userId, body.ownerUserId)),
      columns: { id: true },
    })
    if (!orgMember) throw createError({ statusCode: 422, statusMessage: 'Selected owner is not a member of this organization.' })
  }

  const existing = await db.query.recruitmentRequirementState.findFirst({
    where: and(eq(recruitmentRequirementState.organizationId, orgId), eq(recruitmentRequirementState.jobId, jobId)),
  })

  const now = new Date()
  const [state] = existing
    ? await db.update(recruitmentRequirementState).set({ ownerUserId: body.ownerUserId, updatedAt: now }).where(eq(recruitmentRequirementState.id, existing.id)).returning()
    : await db.insert(recruitmentRequirementState).values({ organizationId: orgId, jobId, ownerUserId: body.ownerUserId }).returning()

  return { state }
})
