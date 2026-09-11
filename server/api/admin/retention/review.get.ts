import { eq, max } from 'drizzle-orm'
import { candidate, application, orgSettings } from '../../../database/schema'
import { computeRetentionState } from '../../../utils/retention'
import { assertRecruitmentAdmin } from '../../../utils/recruitmentVisibility'

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { candidate: ['delete'] })
  const orgId = session.session.activeOrganizationId
  await assertRecruitmentAdmin(orgId, session.user.id)

  const settings = await db.query.orgSettings.findFirst({
    where: eq(orgSettings.organizationId, orgId),
    columns: { retentionEnabled: true, retentionMonths: true, retentionActivatedAt: true },
  })

  const retentionMonths = settings?.retentionMonths ?? 24
  const retentionActivatedAt = settings?.retentionActivatedAt ?? null

  const candidates = await db.query.candidate.findMany({
    where: eq(candidate.organizationId, orgId),
    columns: {
      id: true, firstName: true, lastName: true, email: true, createdAt: true,
      retentionExemptUntil: true, retentionExemptReason: true, retentionReviewedAt: true,
      quarantinedAt: true, scheduledPurgeAt: true,
    },
  })

  const latestRows = await db.select({ candidateId: application.candidateId, latest: max(application.updatedAt) })
    .from(application)
    .where(eq(application.organizationId, orgId))
    .groupBy(application.candidateId)
  const latestByCandidate = new Map(latestRows.map(r => [r.candidateId, r.latest]))

  const now = new Date()
  const items = candidates.map((c) => {
    const { status, expiresAt } = computeRetentionState({
      latestProcessEnd: latestByCandidate.get(c.id) ?? null,
      candidateCreatedAt: c.createdAt,
      lastReviewedAt: c.retentionReviewedAt,
      retentionActivatedAt,
      retentionMonths,
      exemptUntil: c.retentionExemptUntil,
      now,
    })
    const effectiveStatus = c.quarantinedAt ? 'quarantined' as const : status
    return {
      id: c.id,
      name: `${c.firstName} ${c.lastName}`.trim(),
      email: c.email,
      status: effectiveStatus,
      expiresAt,
      quarantinedAt: c.quarantinedAt,
      scheduledPurgeAt: c.scheduledPurgeAt,
      exemptUntil: c.retentionExemptUntil,
      exemptReason: c.retentionExemptReason,
    }
  }).filter(i => i.status !== 'active')

  return {
    cleanupEnabled: env.GDPR_CLEANUP_ENABLED,
    retentionEnabled: settings?.retentionEnabled ?? false,
    retentionMonths,
    count: items.length,
    items,
  }
})
