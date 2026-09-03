import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { generatedResumeAssessmentSchema } from '../../server/utils/ai/pdsResumeAssessment'

const source = readFileSync(new URL('../../server/utils/ai/pdsResumeAssessment.ts', import.meta.url), 'utf8')

describe('PDS AI resume assessment policy', () => {
  it('keeps the approved Skill Matrix authoritative and forbids generic role assumptions', () => {
    expect(source).toContain('The Skill Matrix is the authoritative assessment framework')
    expect(source).toContain('do not replace it with generic role assumptions')
    expect(source).toContain('Assess every skill in the approved matrix exactly once')
  })

  it('requires evidence before treating a resume claim as capability', () => {
    expect(source).toContain('A resume mention is not automatically proof of capability')
    expect(source).toContain('Do not convert team-level or company-level achievements into candidate ownership')
    expect(source).toContain('Never invent metrics, customers, technologies, responsibilities, achievements, tenure, compensation, notice period or motivations')
  })

  it('keeps Mandatory evidence from being compensated by lower-priority strengths', () => {
    expect(source).toContain('Missing or weak Mandatory evidence must materially reduce this score')
    expect(source).toContain('do not compensate with Preferred or Optional strengths')
    expect(source).toContain('several no_evidence_found or requires_verification Mandatory items must not receive a high mandatoryScore')
  })

  it('calibrates evidence levels and turns uncertainty into recruiter verification', () => {
    expect(source).toContain('strong evidence should generally contribute 85-100')
    expect(source).toContain('partial evidence 45-75')
    expect(source).toContain('requires verification 20-50')
    expect(source).toContain('verificationAreas must be practical recruiter-screening checks')
  })

  it('accepts the complete evidence-based output contract', () => {
    const result = generatedResumeAssessmentSchema.safeParse({
      candidateSnapshot: 'Enterprise sales candidate with evidence of owned account growth and closure activity.',
      jdAlignment: 'Strong evidence in account growth; pricing ownership requires verification.',
      skillAssessment: [
        {
          classification: 'Enterprise Account Growth',
          skill: 'Independent new-logo acquisition ownership',
          priority: 'mandatory',
          evidenceLevel: 'strong_evidence',
          evidence: 'Resume states independently won two named enterprise accounts and carried the target.',
        },
      ],
      keyGaps: ['Independent pricing approval authority is not evidenced.'],
      verificationAreas: ['Verify personal pricing and commercial closure authority.'],
      mandatoryScore: 88,
      preferredScore: 72,
      experienceScore: 80,
      optionalScore: 100,
      mandatoryMatch: '1/1 strongly evidenced',
      keyStrength: 'Direct evidence of independent new-logo acquisition ownership.',
      mainGap: 'Pricing ownership is not evidenced.',
    })

    expect(result.success).toBe(true)
  })
})
