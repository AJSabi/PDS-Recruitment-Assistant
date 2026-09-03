import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

function source(path: string) {
  return readFileSync(path, 'utf8')
}

describe('PDS retention quarantine regressions', () => {
  it('keeps recruiter-created recruitment activity blocked for quarantined candidates', () => {
    const manualApplication = source('server/api/applications/index.post.ts')
    const candidateUpdate = source('server/api/candidates/[id].patch.ts')
    const documentUpload = source('server/api/candidates/[id]/documents/index.post.ts')
    const candidateIntake = source('server/api/jobs/[id]/candidate-intake.post.ts')

    expect(manualApplication).toContain('findActiveCandidate')
    expect(candidateUpdate).toContain('isNull(candidate.quarantinedAt)')
    expect(documentUpload).toContain('findActiveCandidate')
    expect(candidateIntake).toContain('quarantinedAt')
  })

  it('freezes active application workflow mutations while retaining historical read access', () => {
    const applicationUpdate = source('server/api/applications/[id].patch.ts')
    const recruitmentProfileUpdate = source('server/api/applications/[id]/recruitment-profile/index.put.ts')
    const stageConfirm = source('server/api/applications/[id]/stage/confirm.post.ts')
    const applicationRead = source('server/api/applications/[id].get.ts')

    expect(applicationUpdate).toContain('assertActiveApplicationCandidate')
    expect(recruitmentProfileUpdate).toContain('assertActiveApplicationCandidate')
    expect(stageConfirm).toContain('assertActiveApplicationCandidate')
    expect(applicationRead).not.toContain('assertActiveApplicationCandidate')
  })

  it('restores public re-engagement atomically with the new application and retention audit', () => {
    const publicApply = source('server/api/public/jobs/[slug]/apply.post.ts')
    const transactionIndex = publicApply.indexOf('db.transaction(async (tx)')
    const restoreIndex = publicApply.indexOf('updates.quarantinedAt = null')
    const auditIndex = publicApply.indexOf('tx.insert(retentionAudit)')
    const applicationIndex = publicApply.indexOf('tx.insert(application)')

    expect(transactionIndex).toBeGreaterThan(-1)
    expect(restoreIndex).toBeGreaterThan(transactionIndex)
    expect(auditIndex).toBeGreaterThan(transactionIndex)
    expect(applicationIndex).toBeGreaterThan(transactionIndex)
    expect(publicApply).not.toContain('restoreCandidateForPublicApplication')
  })

  it('preserves point-in-time resumes when a returning candidate reapplies', () => {
    const publicApply = source('server/api/public/jobs/[slug]/apply.post.ts')

    expect(publicApply).toContain('const existingDocCount = existingCandidate')
    expect(publicApply).toContain('await tx.insert(document).values')
    expect(publicApply).toContain('candidateId,')
    expect(publicApply).not.toContain('tx.delete(document)')
    expect(publicApply).not.toContain('tx.update(document)')
  })
})
