import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(path, 'utf8')

describe('PDS recruitment command centre UX', () => {
  it('uses a recruitment-first operational dashboard with scoped KPIs', () => {
    const dashboard = read('app/pages/dashboard/index.vue')
    expect(dashboard).toContain('data-testid="recruitment-command-centre"')
    expect(dashboard).toContain('data-testid="recruitment-kpi-strip"')
    expect(dashboard).toContain('Active Requisitions')
    expect(dashboard).toContain('Need Attention')
    expect(dashboard).toContain('Active Candidates')
    expect(dashboard).toContain('Actions Pending')
    expect(dashboard).toContain('In Interview')
    expect(dashboard).toContain('Offers in Process')
    expect(dashboard).toContain("scope.value.allocatedOnly ? 'My Recruitment Command Centre'")
  })

  it('separates current funnel distribution from historical performance analytics', () => {
    const dashboard = read('app/pages/dashboard/index.vue')
    expect(dashboard).toContain('data-testid="hiring-funnel"')
    expect(dashboard).toContain('Current candidate distribution across recruitment stages')
    expect(dashboard).toContain('Historical conversion ratios and recruiter performance trends are available in Recruitment Analytics where sufficient telemetry exists.')
    expect(dashboard).not.toContain('AI Recommended Recruiter')
    expect(dashboard).not.toContain('Best Candidate')
  })

  it('keeps TAT tied to allocation and surfaces requisition health', () => {
    const dashboard = read('app/pages/dashboard/index.vue')
    const stats = read('server/api/dashboard/stats.get.ts')
    expect(dashboard).toContain('data-testid="requisition-health"')
    expect(dashboard).toContain("if (!job.assignmentDate || job.openDays == null) return 'TAT not started'")
    expect(stats).toContain('recruitmentRequirementState.assignmentDate')
    expect(stats).toContain('case when ${recruitmentRequirementState.assignmentDate} is null then null')
  })

  it('uses recruitment-oriented navigation and keeps TA operations role-gated', () => {
    const topbar = read('app/components/AppTopBar.vue')
    expect(topbar).toContain("label: 'Command Centre'")
    expect(topbar).toContain("label: 'Requisitions'")
    expect(topbar).toContain("label: 'Candidate Database'")
    expect(topbar).toContain("label: 'TA Operations'")
    expect(topbar).toContain("label: 'Team Allocation'")
    expect(topbar).toContain('canManageRequirements.value ? [')
    expect(topbar).not.toContain("label: 'AI Usage'")
  })
})
