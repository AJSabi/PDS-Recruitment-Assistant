import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { calculateProvisionalFit } from '../../server/utils/recruitmentScoring'

const readSource = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

describe('PDS Candidate Pool scoring policy', () => {
  it('keeps the agreed P1-P4 numerical bands', () => {
    expect(calculateProvisionalFit({ mandatoryScore: 100, preferredScore: 100, experienceScore: 0, optionalScore: 100 }))
      .toEqual({ score: 85, priority: 'P1' })
    expect(calculateProvisionalFit({ mandatoryScore: 80, preferredScore: 80, experienceScore: 80, optionalScore: 80 }))
      .toEqual({ score: 80, priority: 'P2' })
    expect(calculateProvisionalFit({ mandatoryScore: 65, preferredScore: 65, experienceScore: 65, optionalScore: 65 }))
      .toEqual({ score: 65, priority: 'P3' })
    expect(calculateProvisionalFit({ mandatoryScore: 55, preferredScore: 55, experienceScore: 55, optionalScore: 55 }))
      .toEqual({ score: 55, priority: 'P4' })
  })

  it('makes Mandatory evidence the dominant scoring dimension', () => {
    const result = calculateProvisionalFit({ mandatoryScore: 100, preferredScore: 0, experienceScore: 0, optionalScore: 0 })
    expect(result.score).toBe(60)
    expect(result.priority).toBe('P3')
  })

  it('downgrades candidates with critical Mandatory weakness even when other dimensions are strong', () => {
    const criticalGap = calculateProvisionalFit({ mandatoryScore: 39, preferredScore: 100, experienceScore: 100, optionalScore: 100 })
    expect(criticalGap.score).toBeGreaterThanOrEqual(60)
    expect(criticalGap.priority).toBe('P4')

    const materialGap = calculateProvisionalFit({ mandatoryScore: 55, preferredScore: 100, experienceScore: 100, optionalScore: 100 })
    expect(materialGap.score).toBeGreaterThanOrEqual(70)
    expect(materialGap.priority).toBe('P3')
  })

  it('clamps malformed out-of-range aggregate scores rather than returning an invalid percentage', () => {
    expect(calculateProvisionalFit({ mandatoryScore: 150, preferredScore: 150, experienceScore: 150, optionalScore: 150 }).score).toBe(100)
    expect(calculateProvisionalFit({ mandatoryScore: -50, preferredScore: -50, experienceScore: -50, optionalScore: -50 }).score).toBe(0)
  })
})

describe('PDS Candidate Pool visibility and authorization policy', () => {
  it('keeps the working Candidate Pool threshold at 50 percent and ranks best-to-worst', () => {
    const source = readSource('server/api/jobs/[id]/talent-pool/index.get.ts')
    expect(source).toContain('const FINAL_POOL_THRESHOLD = 50')
    expect(source).toContain('gte(talentPoolMatch.score, FINAL_POOL_THRESHOLD)')
    expect(source).toContain('.orderBy(desc(talentPoolMatch.score)')
  })

  it('requires requirement-level access before Candidate Pool data is read or synced', () => {
    const listSource = readSource('server/api/jobs/[id]/talent-pool/index.get.ts')
    const syncSource = readSource('server/api/jobs/[id]/talent-pool/sync.post.ts')
    const legacyRankingSource = readSource('server/api/jobs/[id]/batch-ranking.get.ts')
    for (const source of [listSource, syncSource, legacyRankingSource]) {
      expect(source).toContain('assertRequirementAccess')
      expect(source).toMatch(/await assertRequirementAccess\(orgId, session\.user\.id, jobId\)/)
    }
  })

  it('persists full AI assessments before deciding whether a candidate is hidden below 50 percent', () => {
    const source = readSource('server/api/jobs/[id]/talent-pool/sync.post.ts')
    const persistencePosition = Math.min(
      ...['await db.update(talentPoolMatch)', 'await db.insert(talentPoolMatch)']
        .map(token => source.indexOf(token))
        .filter(position => position >= 0),
    )
    const thresholdPosition = source.indexOf('if (ranking.score < FINAL_POOL_THRESHOLD) belowThreshold++')

    expect(persistencePosition).toBeGreaterThanOrEqual(0)
    expect(thresholdPosition).toBeGreaterThan(persistencePosition)
  })

  it('bounds each explicit database refresh to a small proxy-safe AI batch and defers the rest', () => {
    const source = readSource('server/api/jobs/[id]/talent-pool/sync.post.ts')
    expect(source).toContain('MAX_FULL_AI_ANALYSES_PER_SYNC = 3')
    expect(source).toContain('deferredForAiBudget++')
    expect(source).toContain('maxFullAiAnalysesPerSync: MAX_FULL_AI_ANALYSES_PER_SYNC')
  })
})
