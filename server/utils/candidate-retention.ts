import { and, eq, isNotNull, isNull } from 'drizzle-orm'
import { application, candidate } from '../database/schema'
import { recordRetentionAudit } from './erasure'

/**
 * Return a candidate only when it belongs to the organization and is not in
 * retention quarantine. Use this for operations that would add or mutate data.
 */
export async function findActiveCandidate(orgId: string, candidateId: string) {
  return db.query.candidate.findFirst({
    where: and(
      eq(candidate.id, candidateId),
      eq(candidate.organizationId, orgId),
      isNull(candidate.quarantinedAt),
    ),
    columns: { id: true },
  })
}

/**
 * Guard application mutations without hiding historical read access. A
 * quarantined candidate's existing applications remain visible for evidence and
 * audit, but recruiters cannot progress or otherwise mutate those applications
 * until the candidate is explicitly restored or re-engages through public apply.
 */
export async function assertActiveApplicationCandidate(orgId: string, applicationId: string) {
  const [active] = await db
    .select({ candidateId: candidate.id })
    .from(application)
    .innerJoin(candidate, and(
      eq(candidate.id, application.candidateId),
      eq(candidate.organizationId, orgId),
    ))
    .where(and(
      eq(application.id, applicationId),
      eq(application.organizationId, orgId),
      isNull(candidate.quarantinedAt),
    ))
    .limit(1)

  if (!active) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Candidate is quarantined or application not found',
    })
  }

  return active
}

/**
 * A new public application is fresh engagement by the data subject. Restore a
 * matching quarantined candidate and reset the retention clock before attaching
 * the new application. This is intentionally idempotent.
 *
 * Prefer restoring inside the caller's application transaction when candidate
 * activation must commit atomically with new recruitment activity. This helper
 * remains for explicit standalone restore flows.
 */
export async function restoreCandidateForPublicApplication(
  orgId: string,
  candidateId: string,
): Promise<boolean> {
  const now = new Date()
  const [restored] = await db.update(candidate)
    .set({
      quarantinedAt: null,
      scheduledPurgeAt: null,
      retentionReviewedAt: now,
      updatedAt: now,
    })
    .where(and(
      eq(candidate.id, candidateId),
      eq(candidate.organizationId, orgId),
      isNotNull(candidate.quarantinedAt),
    ))
    .returning({ id: candidate.id })

  if (!restored) return false

  await recordRetentionAudit(orgId, candidateId, 'restored', 'success', null, {
    source: 'public_application',
  })
  logInfo('retention.candidate_restored_on_application', {
    org_id: orgId,
    candidate_id: candidateId,
  })
  return true
}
