import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

describe('PDS management recruitment dashboard', () => {
  it('separates executive hiring outcomes from TA recruiter operations', () => {
    const page = source('app/pages/dashboard/management-analytics.vue')
    expect(page).toContain('data-testid="management-recruitment-dashboard"')
    expect(page).toContain('Management Recruitment Dashboard')
    expect(page).toContain('Hiring Health & Outcomes')
    expect(page).toContain('Recruiter-level activity remains in TA Operations.')
    expect(page).not.toContain('Recruiter Workload & Productivity')
    expect(page).not.toContain('recruiters"')
  })

  it('surfaces management vacancy health and pipeline coverage', () => {
    const page = source('app/pages/dashboard/management-analytics.vue')
    expect(page).toContain('data-testid="management-hiring-health-strip"')
    expect(page).toContain('Open Vacancies')
    expect(page).toContain('Closure Risk')
    expect(page).toContain('Vacancies With Pipeline')
    expect(page).toContain('Average TAT Days')
    expect(page).toContain('Number(row.activeCandidates ?? 0) > 0')
    expect(page).toContain('Measured from recruiter allocation only')
  })

  it('keeps current pipeline and historical conversion semantically separate', () => {
    const page = source('app/pages/dashboard/management-analytics.vue')
    expect(page).toContain('Current Hiring Pipeline')
    expect(page).toContain('point-in-time pipeline view, not a historical conversion funnel')
    expect(page).toContain('data-testid="management-conversion-outcomes"')
    expect(page).toContain('Historical Hiring Conversion')
    expect(page).toContain('historicalConversions.telemetryStartAt')
  })

  it('shows decision-stage outcomes and critical vacancy risk without ranking people', () => {
    const page = source('app/pages/dashboard/management-analytics.vue')
    expect(page).toContain('data-testid="management-outcome-snapshot"')
    expect(page).toContain('Candidates in interview stages')
    expect(page).toContain('Candidates in offer stages')
    expect(page).toContain('Joined in current requisition set')
    expect(page).toContain('Critical Vacancy Watchlist')
    expect(page).toContain('No active pipeline')
    expect(page).not.toContain('Best Recruiter')
    expect(page).not.toContain('Top Recruiter')
    expect(page).not.toContain('Best Candidate')
  })

  it('retains governed source and historical telemetry limitations', () => {
    const page = source('app/pages/dashboard/management-analytics.vue')
    const api = source('server/api/dashboard/management.get.ts')
    expect(page).toContain('Source-to-Hire Effectiveness')
    expect(page).toContain('limitations.sourceEffectiveness')
    expect(page).toContain('limitations.historicalConversion')
    expect(api).toContain('assertRecruitmentAdmin')
    expect(api).toContain('HISTORICAL_TELEMETRY_START')
    expect(api).toContain('SOURCE_EFFECTIVENESS_START')
  })
})
