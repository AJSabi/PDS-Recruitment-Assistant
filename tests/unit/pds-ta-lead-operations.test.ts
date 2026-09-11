import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

describe('PDS TA Lead operations dashboard', () => {
  it('keeps TA operational metrics admin-governed and evidence based', () => {
    const api = source('server/api/dashboard/ta-lead-kpis.get.ts')
    expect(api).toContain('await assertRecruitmentAdmin(orgId, userId)')
    expect(api).toContain("const TIME_ZONE = 'Asia/Kolkata'")
    expect(api).toContain('const AVERAGE_DAYS = 30')
    expect(api).toContain('recruitmentEvidence.createdBy')
    expect(api).toContain("inArray(recruitmentEvidence.type, ['sourcing', 'stage_change'])")
    expect(api).not.toContain('assignedRecruiterId')
  })

  it('covers the daily sourcing-to-joining recruitment movement required by the TA Lead', () => {
    const api = source('server/api/dashboard/ta-lead-kpis.get.ts')
    for (const stage of [
      'recruiter_screening_completed',
      'hiring_manager_round_pending',
      'hod_round_pending',
      'hr_round_pending',
      'hiring_manager_round_completed',
      'hod_round_completed',
      'hr_round_completed',
      'offer_stage',
      'offer_accepted',
      'offer_declined',
      'joined',
    ]) expect(api).toContain(stage)
  })

  it('keeps the TA Lead dashboard operational and non-ranking', () => {
    const page = source('app/pages/dashboard/ta-operations.vue')
    expect(page).toContain('TA Lead Command Centre')
    expect(page).toContain('data-testid="ta-daily-team-pulse"')
    expect(page).toContain('data-testid="ta-recruiter-performance-table"')
    expect(page).toContain('This view does not rank recruiters.')
    expect(page).toContain('Previous weekday')
    expect(page).toContain('Daily avg')
    for (const label of [
      'Open Requisitions',
      'Unallocated',
      'Overdue Reqs',
      'Active Candidates',
      'Interviews Scheduled',
      'Offers Raised',
    ]) expect(page).toContain(label)
  })

  it('preserves allocation-based TAT semantics from the governed management dataset', () => {
    const page = source('app/pages/dashboard/ta-operations.vue')
    const management = source('server/api/dashboard/management.get.ts')
    expect(page).toContain('TAT begins from recruiter allocation only.')
    expect(management).toContain('daysBetween(row.assignmentDate, today)')
    expect(management).toContain('tatStarted: row.assignmentDate != null')
    expect(management).not.toContain('daysBetween(row.createdAt')
  })

  it('surfaces TA Operations in primary recruitment navigation while preserving management analytics separately', () => {
    const topbar = source('app/components/AppTopBar.vue')
    const page = source('app/pages/dashboard/ta-operations.vue')
    expect(topbar).toContain("{ label: 'TA Operations', to: '/dashboard/ta-operations'")
    expect(page).toContain("'/dashboard/management-analytics'")
  })
})
