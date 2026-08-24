import { and, eq } from 'drizzle-orm'
import { job, jobSkillMatrix, recruitmentRequirementState } from '../../../../database/schema'
import { saveSkillMatrixSchema } from '../../../../utils/schemas/skillMatrix'
import { ensureRequirementState, flagRequirementChange } from '../../../../utils/recruitmentLifecycle'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { scoring: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { id: jobId } = await getValidatedRouterParams(event, paramsSchema.parse)
  const body = await readValidatedBody(event, saveSkillMatrixSchema.parse)

  const jobRecord = await db.query.job.findFirst({
    where: and(eq(job.id, jobId), eq(job.organizationId, orgId)),
    columns: { id: true },
  })
  if (!jobRecord) throw createError({ statusCode: 404, statusMessage: 'Job not found' })

  const previous = await db.query.jobSkillMatrix.findFirst({
    where: and(eq(jobSkillMatrix.jobId, jobId), eq(jobSkillMatrix.organizationId, orgId)),
    columns: { matrix: true, approvedMatrix: true, approvedAt: true },
  })

  const now = new Date()
  const approvedAt = body.approved ? now : null
  const approvedMatrix = body.approved ? body.matrix : null
  const updateValues: Record<string, unknown> = {
    matrix: body.matrix,
    approvedAt,
    updatedAt: now,
  }
  // Saving an unapproved draft must never erase the last approved baseline.
  if (body.approved) updateValues.approvedMatrix = body.matrix

  const [saved] = await db.insert(jobSkillMatrix).values({
    organizationId: orgId,
    jobId,
    matrix: body.matrix,
    approvedMatrix,
    approvedAt,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: jobSkillMatrix.jobId,
    set: updateValues,
  }).returning()

  const state = await ensureRequirementState(orgId, jobId)
  const approvedBaselineChanged = body.approved
    && previous?.approvedMatrix != null
    && JSON.stringify(previous.approvedMatrix) !== JSON.stringify(body.matrix)
  const firstApproval = body.approved && previous?.approvedMatrix == null

  if (approvedBaselineChanged) {
    const result = await flagRequirementChange({
      organizationId: orgId,
      jobId,
      actorId: session.user.id,
      changeType: 'skill_matrix',
      summary: 'Approved Skill Matrix changed. Existing candidate assessments were preserved and flagged for reassessment.',
    })

    await db.update(recruitmentRequirementState)
      .set({
        skillMatrixApproved: true,
        skillMatrixApprovedAt: now,
        updatedAt: now,
      })
      .where(eq(recruitmentRequirementState.id, result.state.id))
  } else {
    await db.update(recruitmentRequirementState)
      .set({
        skillMatrixApproved: body.approved,
        skillMatrixApprovedAt: body.approved ? now : null,
        skillMatrixVersion: firstApproval && state.skillMatrixVersion === 0 ? 1 : state.skillMatrixVersion,
        updatedAt: now,
      })
      .where(eq(recruitmentRequirementState.id, state.id))
  }

  return {
    matrix: saved?.matrix ?? body.matrix,
    approved: Boolean(saved?.approvedAt),
    approvedAt: saved?.approvedAt ?? null,
    updatedAt: saved?.updatedAt ?? now,
  }
})
