import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { applicationSourcePersistence, recruitmentSourceFromPersistence, RECRUITMENT_SOURCE_VALUES } from '../../server/utils/recruitmentSource'

const readSource = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

describe('PDS governed recruitment source effectiveness', () => {
  it('uses the approved recruiter-facing source taxonomy', () => {
    expect(RECRUITMENT_SOURCE_VALUES).toEqual([
      'recruiter_sourcing',
      'employee_referral',
      'linkedin',
      'naukri',
      'career_site',
      'existing_database',
      'agency',
      'other',
    ])
  })

  it('reuses the existing application_source model without inventing a duplicate source table', () => {
    expect(applicationSourcePersistence('linkedin')).toEqual({ channel: 'linkedin', utmSource: 'linkedin' })
    expect(applicationSourcePersistence('naukri')).toEqual({ channel: 'custom', utmSource: 'naukri' })
    expect(applicationSourcePersistence('existing_database')).toEqual({ channel: 'custom', utmSource: 'existing_database' })
    expect(recruitmentSourceFromPersistence('custom', 'naukri')).toBe('naukri')
    expect(recruitmentSourceFromPersistence('custom', 'existing_database')).toBe('existing_database')
  })

  it('captures source in recruiter intake and talent-pool promotion paths', () => {
    const intake = readSource('server/api/jobs/[id]/candidate-intake.post.ts')
    const legacy = readSource('server/api/applications/index.post.ts')
    const promotion = readSource('server/api/jobs/[id]/talent-pool/[matchId]/promote.post.ts')
    expect(intake).toContain('tx.insert(applicationSource)')
    expect(intake).toContain('applicationSourcePersistence(body.source)')
    expect(legacy).toContain("applicationSourcePersistence('recruiter_sourcing')")
    expect(promotion).toContain("match.source === 'database' ? 'existing_database' : 'recruiter_sourcing'")
  })

  it('requires a source choice in the recruiter intake UI', () => {
    const modal = readSource('app/components/ApplyCandidateModal.vue')
    expect(modal).toContain('Candidate source')
    expect(modal).toContain("{ value: 'naukri', label: 'Naukri' }")
    expect(modal).toContain("source.value = value === 'existing' ? 'existing_database' : 'recruiter_sourcing'")
    expect(modal).toContain('source: source.value')
  })

  it('keeps source effectiveness on a declared governed baseline and stage events', () => {
    const management = readSource('server/api/dashboard/management.get.ts')
    expect(management).toContain("SOURCE_EFFECTIVENESS_START = new Date('2026-09-01T05:55:20.000Z')")
    expect(management).toContain('gte(applicationSource.createdAt, SOURCE_EFFECTIVENESS_START)')
    expect(management).toContain("'recruiter_screening_completed', 'hiring_manager_round_pending', 'offer_stage', 'joined'")
    expect(management).toContain('buildSourceEffectiveness(sourceRows, sourceStageRows)')
  })
})
