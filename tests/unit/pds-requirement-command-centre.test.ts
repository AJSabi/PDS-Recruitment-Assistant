import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readSource = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

describe('PDS requirement recruitment command centre', () => {
  it('centres the requirement page on recruitment health and execution readiness', () => {
    const source = readSource('app/pages/dashboard/jobs/[id]/index.vue')
    expect(source).toContain('Requirement Command Centre')
    expect(source).toContain('Recruiter Allocation')
    expect(source).toContain('Closure Health')
    expect(source).toContain('Requirement Readiness')
    expect(source).toContain('Hiring Pipeline')
    expect(source).toContain('Candidates Needing Attention')
  })

  it('keeps TAT tied to recruiter allocation rather than requirement creation', () => {
    const source = readSource('app/pages/dashboard/jobs/[id]/index.vue')
    expect(source).toContain('profile.value?.assignmentDate')
    expect(source).toContain('From recruiter allocation date')
    expect(source).toContain('TAT has not started')
    expect(source).not.toContain('jobData.value.createdAt')
  })

  it('uses governed requirement readiness state from the requirement profile API', () => {
    const api = readSource('server/api/jobs/[id]/requirement-profile.get.ts')
    expect(api).toContain('ownerUserId: state.ownerUserId ?? null')
    expect(api).toContain('allocated: Boolean(state.ownerUserId && state.assignmentDate)')
    expect(api).toContain('hasActiveJd')
    expect(api).toContain('skillMatrixApproved')
  })

  it('provides direct recruitment work areas without inline stage mutation', () => {
    const source = readSource('app/pages/dashboard/jobs/[id]/index.vue')
    expect(source).toContain('Candidate Pipeline')
    expect(source).toContain('JD & Skill Matrix')
    expect(source).toContain('Candidate Match')
    expect(source).toContain('Sourcing Toolkit')
    expect(source).toContain('Candidate Register')
    expect(source).not.toContain("method: 'PATCH'")
    expect(source).not.toContain('/stage/confirm')
  })
})
