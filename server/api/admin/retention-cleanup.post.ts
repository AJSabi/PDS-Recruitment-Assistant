/**
 * POST /api/admin/retention-cleanup
 * External cron and interactive admin entrypoint.
 */
import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { runRetentionCleanup } from '../../utils/retention-cleanup'
import { assertRecruitmentAdmin } from '../../utils/recruitmentVisibility'

const bodySchema = z.object({
  dryRun: z.boolean().optional().default(false),
  batchSize: z.number().int().min(1).max(2000).optional().default(200),
})

export default defineEventHandler(async (event) => {
  const cronSecret = getHeader(event, 'x-cron-secret')
  let actorId: string | null = null
  let source: 'cron_endpoint' | 'interactive' = 'interactive'

  if (cronSecret && env.CRON_SECRET) {
    const supplied = Buffer.from(cronSecret)
    const expected = Buffer.from(env.CRON_SECRET)
    const valid = supplied.length === expected.length && timingSafeEqual(supplied, expected)
    if (!valid) throw createError({ statusCode: 403, statusMessage: 'Invalid cron secret' })
    source = 'cron_endpoint'
  } else {
    const session = await requirePermission(event, { candidate: ['delete'] })
    const orgId = session.session.activeOrganizationId
    await assertRecruitmentAdmin(orgId, session.user.id)
    actorId = session.user.id
  }

  const body = await readValidatedBody(event, bodySchema.parse)
  return runRetentionCleanup({ ...body, actorId, source })
})
