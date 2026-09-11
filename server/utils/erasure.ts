/**
 * Candidate erasure service — the single source of truth for deletion.
 *
 * Manual deletion and automated retention both route through eraseCandidates.
 * The service removes S3 objects plus the complete candidate data graph,
 * including polymorphic property/comment/activity rows that are not protected by
 * relational cascades.
 *
 * For automated retention, the candidate row is locked before destructive S3
 * work begins and eligibility is re-checked while the lock is held. A concurrent
 * public reapplication therefore either restores the candidate first (purge is
 * skipped before S3 deletion) or waits until the purge commits. This closes the
 * former window where S3 objects could be deleted after a candidate had reapplied.
 *
 * `db`, `deleteFromS3`, `logWarn`, `logInfo`, `logError` are Nitro auto-imports.
 */
import { and, eq, inArray, or } from 'drizzle-orm'
import {
  candidate,
  application,
  document,
  interview,
  propertyValue,
  comment,
  activityLog,
  retentionAudit,
} from '../database/schema'
import { isPurgeEligible } from './retention'

export interface ErasureOptions {
  dryRun?: boolean
  actorId?: string | null
  auditMetadata?: Record<string, number | string>
  requirePurgeEligible?: boolean
  now?: Date
}

export type ErasureStatus =
  | 'erased'
  | 'skipped_s3_failure'
  | 'skipped_not_eligible'
  | 'not_found'
  | 'would_erase'

class PurgeNoLongerEligibleError extends Error {}
class CandidateNoLongerExistsError extends Error {}
class S3DeletionFailedError extends Error {}

export interface ErasureResult {
  candidateId: string
  status: ErasureStatus
  documents: number
  comments: number
  properties: number
  activityLogs: number
  s3Failures: number
  auditFailed?: boolean
  error?: string
}

export interface ErasureReport {
  dryRun: boolean
  processed: number
  erased: number
  skipped: number
  results: ErasureResult[]
}

export async function eraseCandidates(
  orgId: string,
  candidateIds: string[],
  opts: ErasureOptions = {},
): Promise<ErasureReport> {
  const dryRun = opts.dryRun ?? false
  const actorId = opts.actorId ?? null
  const requirePurgeEligible = opts.requirePurgeEligible ?? false
  const now = opts.now ?? new Date()
  const results: ErasureResult[] = []

  for (const candidateId of candidateIds) {
    results.push(await eraseOne(
      orgId,
      candidateId,
      dryRun,
      actorId,
      opts.auditMetadata ?? {},
      requirePurgeEligible,
      now,
    ))
  }

  return {
    dryRun,
    processed: results.length,
    erased: results.filter(r => r.status === 'erased' || r.status === 'would_erase').length,
    skipped: results.filter(r =>
      r.status === 'skipped_s3_failure'
      || r.status === 'skipped_not_eligible'
      || r.status === 'not_found',
    ).length,
    results,
  }
}

async function eraseOne(
  orgId: string,
  candidateId: string,
  dryRun: boolean,
  actorId: string | null,
  auditMetadata: Record<string, number | string>,
  requirePurgeEligible: boolean,
  now: Date,
): Promise<ErasureResult> {
  const existing = await db.query.candidate.findFirst({
    where: and(eq(candidate.id, candidateId), eq(candidate.organizationId, orgId)),
    columns: {
      id: true,
      quarantinedAt: true,
      scheduledPurgeAt: true,
      retentionExemptUntil: true,
    },
  })

  if (!existing) return blank(candidateId, 'not_found')

  if (requirePurgeEligible) {
    const stillEligible = existing.quarantinedAt !== null && isPurgeEligible({
      scheduledPurgeAt: existing.scheduledPurgeAt,
      exemptUntil: existing.retentionExemptUntil,
      now,
    })
    if (!stillEligible) {
      logInfo('retention.purge_skipped_not_eligible', { org_id: orgId, phase: 'pre_delete' })
      return blank(candidateId, 'skipped_not_eligible')
    }
  }

  const docs = await db.query.document.findMany({
    where: and(eq(document.candidateId, candidateId), eq(document.organizationId, orgId)),
    columns: { id: true, storageKey: true },
  })
  const documentIds = docs.map(row => row.id)
  const applications = await db.query.application.findMany({
    where: and(eq(application.candidateId, candidateId), eq(application.organizationId, orgId)),
    columns: { id: true },
  })
  const applicationIds = applications.map(row => row.id)
  const interviews = applicationIds.length > 0
    ? await db.query.interview.findMany({
        where: and(
          eq(interview.organizationId, orgId),
          inArray(interview.applicationId, applicationIds),
        ),
        columns: { id: true },
      })
    : []
  const interviewIds = interviews.map(row => row.id)

  const commentScope = applicationIds.length > 0
    ? or(
        and(eq(comment.targetType, 'candidate'), eq(comment.targetId, candidateId)),
        and(eq(comment.targetType, 'application'), inArray(comment.targetId, applicationIds)),
      )
    : and(eq(comment.targetType, 'candidate'), eq(comment.targetId, candidateId))
  const propertyScope = applicationIds.length > 0
    ? or(
        and(eq(propertyValue.entityType, 'candidate'), eq(propertyValue.entityId, candidateId)),
        and(eq(propertyValue.entityType, 'application'), inArray(propertyValue.entityId, applicationIds)),
      )
    : and(eq(propertyValue.entityType, 'candidate'), eq(propertyValue.entityId, candidateId))
  const activityScopes = [
    and(eq(activityLog.resourceType, 'candidate'), eq(activityLog.resourceId, candidateId)),
    ...(applicationIds.length > 0
      ? [and(eq(activityLog.resourceType, 'application'), inArray(activityLog.resourceId, applicationIds))]
      : []),
    ...(interviewIds.length > 0
      ? [and(eq(activityLog.resourceType, 'interview'), inArray(activityLog.resourceId, interviewIds))]
      : []),
    ...(documentIds.length > 0
      ? [and(eq(activityLog.resourceType, 'document'), inArray(activityLog.resourceId, documentIds))]
      : []),
  ]
  const activityScope = activityScopes.length === 1 ? activityScopes[0]! : or(...activityScopes)

  const [commentRows, propertyRows, activityRows] = await Promise.all([
    db.select({ id: comment.id }).from(comment).where(
      and(eq(comment.organizationId, orgId), commentScope),
    ),
    db.select({ id: propertyValue.id }).from(propertyValue).where(
      and(eq(propertyValue.organizationId, orgId), propertyScope),
    ),
    db.select({ id: activityLog.id }).from(activityLog).where(
      and(eq(activityLog.organizationId, orgId), activityScope),
    ),
  ])

  const counts = {
    documents: docs.length,
    comments: commentRows.length,
    properties: propertyRows.length,
    activityLogs: activityRows.length,
  }

  if (dryRun) {
    return { candidateId, status: 'would_erase', s3Failures: 0, ...counts }
  }

  let s3Failures = 0

  try {
    await db.transaction(async (tx) => {
      const [locked] = await tx.select({
        id: candidate.id,
        quarantinedAt: candidate.quarantinedAt,
        scheduledPurgeAt: candidate.scheduledPurgeAt,
        retentionExemptUntil: candidate.retentionExemptUntil,
      })
        .from(candidate)
        .where(and(eq(candidate.id, candidateId), eq(candidate.organizationId, orgId)))
        .for('update')

      if (!locked) throw new CandidateNoLongerExistsError()

      if (requirePurgeEligible) {
        const stillEligible = locked.quarantinedAt !== null && isPurgeEligible({
          scheduledPurgeAt: locked.scheduledPurgeAt,
          exemptUntil: locked.retentionExemptUntil,
          now,
        })
        if (!stillEligible) throw new PurgeNoLongerEligibleError()
      }

      // External object deletion is intentionally performed while the candidate row
      // lock is held. This prevents a concurrent public reapplication from restoring
      // the candidate between eligibility confirmation and destructive storage work.
      for (const doc of docs) {
        try {
          await deleteFromS3(doc.storageKey)
        }
        catch (err) {
          s3Failures++
          logWarn('retention.s3_delete_failed', {
            org_id: orgId,
            candidate_id: candidateId,
            error_message: err instanceof Error ? err.message : String(err),
          })
        }
      }

      if (s3Failures > 0) throw new S3DeletionFailedError()

      await tx.delete(comment).where(
        and(eq(comment.organizationId, orgId), commentScope),
      )
      await tx.delete(propertyValue).where(
        and(eq(propertyValue.organizationId, orgId), propertyScope),
      )
      await tx.delete(activityLog).where(
        and(eq(activityLog.organizationId, orgId), activityScope),
      )

      const deleted = await tx.delete(candidate).where(
        and(eq(candidate.id, candidateId), eq(candidate.organizationId, orgId)),
      ).returning({ id: candidate.id })

      if (deleted.length !== 1) throw new CandidateNoLongerExistsError()
    })
  }
  catch (err) {
    if (err instanceof PurgeNoLongerEligibleError) {
      logInfo('retention.purge_skipped_not_eligible', { org_id: orgId, candidate_id: candidateId, phase: 'locked_recheck' })
      return blank(candidateId, 'skipped_not_eligible')
    }
    if (err instanceof CandidateNoLongerExistsError) {
      return blank(candidateId, 'not_found')
    }
    if (err instanceof S3DeletionFailedError) {
      const audited = await writeAudit(orgId, candidateId, 'erased', 'partial', actorId, {
        ...counts,
        s3Failures,
        ...auditMetadata,
      })
      return {
        candidateId,
        status: 'skipped_s3_failure',
        s3Failures,
        ...counts,
        auditFailed: !audited,
      }
    }
    throw err
  }

  const audited = await writeAudit(orgId, candidateId, 'erased', 'success', actorId, {
    ...counts,
    ...auditMetadata,
  })
  logInfo('retention.candidate_erased', { org_id: orgId, candidate_id: candidateId, ...counts })

  return { candidateId, status: 'erased', s3Failures: 0, ...counts, auditFailed: !audited }
}

async function writeAudit(
  orgId: string,
  candidateId: string,
  action: 'erased' | 'quarantined' | 'restored' | 'exempted' | 'unexempted' | 'exported',
  result: string,
  actorId: string | null,
  metadata: Record<string, number | string>,
): Promise<boolean> {
  try {
    await db.insert(retentionAudit).values({
      organizationId: orgId,
      candidateId,
      action,
      result,
      actorId,
      metadata,
    })
    return true
  }
  catch (err) {
    logError('retention.audit_write_failed', {
      org_id: orgId,
      candidate_id: candidateId,
      action,
      error_message: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}

export { writeAudit as recordRetentionAudit }

function blank(candidateId: string, status: ErasureStatus): ErasureResult {
  return { candidateId, status, documents: 0, comments: 0, properties: 0, activityLogs: 0, s3Failures: 0 }
}
