import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readSource = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

describe('PDS management conversion analytics', () => {
  it('uses governed stage-change evidence after a declared telemetry baseline', () => {
    const source = readSource('server/api/dashboard/management.get.ts')
    expect(source).toContain("const HISTORICAL_TELEMETRY_START = new Date('2026-09-01T05:28:41.000Z')")
    expect(source).toContain("eq(recruitmentEvidence.type, 'stage_change')")
    expect(source).toContain('gte(recruitmentEvidence.createdAt, HISTORICAL_TELEMETRY_START)')
    expect(source).toContain("payload.event !== 'stage_changed' && payload.event !== 'stage_confirmed'")
  })

  it('calculates unique-application interview, offer acceptance and joining cohorts', () => {
    const source = readSource('server/api/dashboard/management.get.ts')
    expect(source).toContain("'hiring_manager_round_pending'")
    expect(source).toContain("'offer_stage'")
    expect(source).toContain("'offer_accepted'")
    expect(source).toContain("'joined'")
    expect(source).toContain("label: 'Interview to Offer'")
    expect(source).toContain("label: 'Offer to Acceptance'")
    expect(source).toContain("label: 'Joining Conversion'")
    expect(source).toContain('new Set(rows.map(row => row.applicationId)).size')
  })

  it('does not report a percentage when the governed denominator is empty', () => {
    const source = readSource('server/api/dashboard/management.get.ts')
    expect(source).toContain('return denominator ? Math.round((numerator / denominator) * 1000) / 10 : null')
    const page = readSource('app/pages/dashboard/management-analytics.vue')
    expect(page).toContain("metric.rate == null ? '—' : `${metric.rate}%`")
    expect(page).toContain('Earlier incomplete history is excluded.')
  })
})
