import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(path, 'utf8')

describe('PDS recruiter UX regressions', () => {
  it('shows allocated Draft and Open requirements on the dashboard', () => {
    const dashboardApi = read('server/api/dashboard/stats.get.ts')
    expect(dashboardApi).toContain("const activeRequirementCondition = sql`${job.status} in ('draft','open')`")
    expect(dashboardApi).toContain('db.$count(job, and(...jobScope, activeRequirementCondition))')
    expect(dashboardApi).toContain('.where(and(...jobScope, activeRequirementCondition))')
  })

  it('makes AI Candidate Pool candidates directly navigable', () => {
    const pool = read('app/pages/dashboard/jobs/[id]/pds-ranking.vue')
    expect(pool).toContain('/dashboard/candidates/${row.candidateId}')
    expect(pool).toContain('View Candidate')
    expect(pool).toContain('Move to Recruitment')
  })

  it('keeps recruiter screening action beside the governed next action', () => {
    const recruitment = read('app/pages/dashboard/recruitment/[id].vue')
    expect(recruitment).toContain('Next Action')
    expect(recruitment).toContain('data-testid="start-recruiter-screening"')
    expect(recruitment).toContain("'Revalidate Candidate'")
  })
})
