import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

describe('PDS recruiter runtime UX safeguards', () => {
  it('allows an allocated member recruiter to save and approve a PDS Skill Matrix without granting broad scoring update', () => {
    const api = source('server/api/jobs/[id]/skill-matrix/index.put.ts')
    expect(api).toContain("requirePermission(event, { scoring: ['create'] })")
    expect(api).toContain('assertRequirementAccess(orgId, session.user.id, jobId)')
    expect(api).not.toContain("scoring: ['update']")
  })

  it('allows explicit Skill Matrix AI generation for the allocated recruiter only', () => {
    const api = source('server/api/jobs/[id]/skill-matrix/generate.post.ts')
    expect(api).toContain("requirePermission(event, { scoring: ['create'] })")
    expect(api).toContain('assertRequirementAccess(orgId, session.user.id, jobId)')
    expect(api).toContain('generateSkillMatrixFromDescription')
    expect(api).not.toContain("scoring: ['update']")
  })

  it('keeps recruiter screening question generation allocation-scoped and gated by an approved Skill Matrix', () => {
    const api = source('server/api/applications/[id]/screening/generate.post.ts')
    expect(api).toContain("requirePermission(event, { application: ['update'], scoring: ['create'] })")
    expect(api).toContain('assertApplicationAccess')
    expect(api).toContain('Approve the Skill Matrix before generating screening questions')
  })

  it('makes the dashboard Actions Pending card open a real recruiter work queue', () => {
    const dashboard = source('app/pages/dashboard/index.vue')
    const queue = source('app/pages/dashboard/actions.vue')
    expect(dashboard).toContain("localePath('/dashboard/actions')")
    expect(dashboard).toContain('Open recruiter action queue')
    expect(queue).toContain("useFetch('/api/dashboard/pending-actions'")
    expect(queue).toContain('/dashboard/recruitment/${row.id}')
  })

  it('keeps pending-action counts and rows limited to actionable candidates in active visible requirements', () => {
    const stats = source('server/api/dashboard/stats.get.ts')
    const queue = source('server/api/dashboard/pending-actions.get.ts')

    for (const api of [stats, queue]) {
      expect(api).toContain("job.status} in ('draft','open')")
      expect(api).toContain('isNotNull(recruitmentApplicationProfile.nextAction)')
      expect(api).toContain("trim(${recruitmentApplicationProfile.nextAction}) <> ''")
      expect(api).toContain("not in ('closed','joined','not_proceeding')")
    }
    expect(queue).toContain('getVisibleRequirementIds')
    expect(stats).toContain('getVisibleRequirementIds')
  })

  it('does not fetch property definitions merely by opening JD & Skill Matrix', () => {
    const subnav = source('app/components/JobSubNavActions.vue')
    expect(subnav).toMatch(/<PropertySchemaEditor\s+[\s\S]*?v-if="showPropertyEditor"/)
  })

  it('keeps Skill Matrix page-open free of implicit AI and Candidate Pool actions', () => {
    const page = source('app/components/PdsJdSkillMatrix.vue')
    expect(page).toContain("useFetch(() => `/api/jobs/${jobId}/skill-matrix`")
    expect(page).toContain("method: 'POST'")
    expect(page).toContain('@click="generateAiMatrix"')
    expect(page).not.toContain('talent-pool/sync')
    expect(page).not.toContain('candidate-database/refresh')
  })
})
