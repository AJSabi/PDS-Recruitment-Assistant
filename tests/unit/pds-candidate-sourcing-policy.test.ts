import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

function source(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
}

describe('PDS candidate sourcing policy', () => {
  it('does not automatically refresh the Candidate Database when the Skill Matrix is approved', () => {
    const matrix = source('app/components/PdsJdSkillMatrix.vue')
    expect(matrix).not.toContain("await $fetch(`/api/jobs/${jobId}/talent-pool/sync`")
    expect(matrix).toContain('does not automatically refresh the Candidate Database')
  })

  it('gives the recruiter a direct resume route and an AI Candidate Pool route after approval', () => {
    const matrix = source('app/components/PdsJdSkillMatrix.vue')
    expect(matrix).toContain('Choose candidate sourcing method')
    expect(matrix).toContain('Attach candidate / resume directly')
    expect(matrix).toContain('Use AI Candidate Pool')
    expect(matrix).toContain('Add Candidate / Resume')
    expect(matrix).toContain('Open AI Candidate Pool')
  })

  it('keeps database-wide AI matching behind the explicit refresh action', () => {
    const pool = source('app/pages/dashboard/jobs/[id]/pds-ranking.vue')
    expect(pool).toContain('async function syncTalentPool()')
    expect(pool).toContain("$fetch(`/api/jobs/${jobId}/talent-pool/sync`, { method: 'POST' })")
    expect(pool).toContain('@click="syncTalentPool"')
    expect(pool).toContain('Refresh Database Matches')
  })

  it('keeps direct candidate intake on the one-candidate quick-match flow and navigates before the modal can unmount', () => {
    const modal = source('app/components/ApplyCandidateModal.vue')
    expect(modal).toContain('/quick-match')
    expect(modal).not.toContain('/talent-pool/sync')
    expect(modal).toContain('Start Recruiter Screening')
    expect(modal).toContain('/dashboard/recruitment/${applicationId}#recruiter-screening')
    const functionStart = modal.indexOf('async function openRecruiterScreening()')
    const functionEnd = modal.indexOf('async function attachCandidate', functionStart)
    const handoff = modal.slice(functionStart, functionEnd)
    expect(handoff).not.toContain("emit('created'")
  })

  it('keeps recruiter screening discoverable after the add-candidate modal is gone', () => {
    const workspace = source('app/pages/dashboard/recruitment/[id].vue')
    const register = source('app/pages/dashboard/jobs/[id]/pds-register.vue')
    expect(workspace).toContain('data-testid="start-recruiter-screening"')
    expect(workspace).toContain('Start Recruiter Screening')
    expect(workspace).toContain('Continue Recruiter Screening')
    expect(register).toContain('Start Recruiter Screening')
    expect(register).toContain('/dashboard/recruitment/${row.applicationId}#recruiter-screening')
  })
})
