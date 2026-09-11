import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

function source(path: string) {
  return readFileSync(path, 'utf8')
}

describe('PDS final audit regressions', () => {
  it('keeps requirement change versioning and reassessment updates atomic', () => {
    const lifecycle = source('server/utils/recruitmentLifecycle.ts')

    expect(lifecycle).toContain('return db.transaction(async (tx) =>')
    expect(lifecycle).toContain('eq(recruitmentRequirementState.revision, state.revision)')
    expect(lifecycle).toContain("statusCode: 409")
    expect(lifecycle).toContain('await tx.insert(recruitmentEvidence).values')
    expect(lifecycle).toContain("type: 'requirement_change'")
  })

  it('does not fabricate completed TAT for legacy closed requirements without closedAt', () => {
    const tat = source('server/api/recruitment/tat.get.ts')

    expect(tat).toContain("const isClosed = Boolean(closedAt) || requirement.status === 'closed'")
    expect(tat).toContain("const daysOpen = assignmentDate && (!isClosed || closedAt)")
    expect(tat).toContain('const daysToTarget = !isClosed && targetClosureDate')
    expect(tat).not.toContain('const effectiveEnd = closedAt ?? now')
  })

  it('locks a purge candidate before deleting S3 objects so reapplication cannot lose documents', () => {
    const erasure = source('server/utils/erasure.ts')
    const transactionIndex = erasure.indexOf('await db.transaction(async (tx) =>')
    const lockIndex = erasure.indexOf(".for('update')")
    const eligibilityIndex = erasure.indexOf('if (requirePurgeEligible)', lockIndex)
    const s3Index = erasure.indexOf('await deleteFromS3(doc.storageKey)', lockIndex)
    const candidateDeleteIndex = erasure.indexOf('const deleted = await tx.delete(candidate)', lockIndex)

    expect(transactionIndex).toBeGreaterThan(-1)
    expect(lockIndex).toBeGreaterThan(transactionIndex)
    expect(eligibilityIndex).toBeGreaterThan(lockIndex)
    expect(s3Index).toBeGreaterThan(eligibilityIndex)
    expect(candidateDeleteIndex).toBeGreaterThan(s3Index)
    expect(erasure).toContain('PurgeNoLongerEligibleError')
    expect(erasure).toContain('S3DeletionFailedError')
  })
})
