import { eq, and } from 'drizzle-orm'
import { comment } from '../../database/schema'
import { commentIdParamSchema, updateCommentSchema } from '../../utils/schemas/comment'
import { assertCommentTargetAccess } from '../../utils/recruitmentVisibility'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { comment: ['update'] })
  const orgId = session.session.activeOrganizationId

  const { id } = await getValidatedRouterParams(event, commentIdParamSchema.parse)
  const body = await readValidatedBody(event, updateCommentSchema.parse)

  const existing = await db.query.comment.findFirst({
    where: and(eq(comment.id, id), eq(comment.organizationId, orgId)),
    columns: { id: true, authorId: true, targetType: true, targetId: true },
  })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Comment not found' })

  await assertCommentTargetAccess(orgId, session.user.id, existing.targetType, existing.targetId)

  if (existing.authorId !== session.user.id) {
    throw createError({ statusCode: 403, statusMessage: 'You can only edit your own comments' })
  }

  const [updated] = await db.update(comment)
    .set({ body: body.body, updatedAt: new Date() })
    .where(eq(comment.id, id))
    .returning({ id: comment.id, targetType: comment.targetType, targetId: comment.targetId, body: comment.body, authorId: comment.authorId, createdAt: comment.createdAt, updatedAt: comment.updatedAt })

  return updated
})
