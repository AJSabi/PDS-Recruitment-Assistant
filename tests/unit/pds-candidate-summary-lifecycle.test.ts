import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readSource = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

describe('PDS AI Candidate Summary lifecycle', () => {
  it('keeps summary reads free of AI generation and config loading', () => {
    const source = readSource('server/api/applications/[id]/candidate-summary/index.get.ts')

    expect(source).not.toContain('loadAiConfig')
    expect(source).not.toContain('generatePdsCandidateSummary')
    expect(source).toContain('aiCandidateSummary')
    expect(source).toContain('aiSummaryStale')
  })

  it('requires an explicit protected POST to regenerate the AI summary', () => {
    const source = readSource('server/api/applications/[id]/candidate-summary/generate.post.ts')

    expect(source).toContain("requirePermission(event, { application: ['update'], scoring: ['create'] })")
    expect(source).toContain('assertApplicationAccess')
    expect(source).toContain('await limiter(event)')
    expect(source).toContain('loadAiConfig')
    expect(source).toContain('generatePdsCandidateSummary')
  })

  it('feeds recorded screening and recruitment evidence into explicit summary refresh', () => {
    const source = readSource('server/api/applications/[id]/candidate-summary/generate.post.ts')

    expect(source).toContain('recruiterScreeningSession')
    expect(source).toContain('recruitmentEvidence')
    expect(source).toContain('.orderBy(asc(recruitmentEvidence.createdAt))')
    expect(source).toContain('screening,')
    expect(source).toContain('evidence,')
  })

  it('clears stale state only when a generated summary is persisted', () => {
    const source = readSource('server/api/applications/[id]/candidate-summary/generate.post.ts')
    const generationPosition = source.indexOf('const generated = await generatePdsCandidateSummary')
    const staleClearPosition = source.indexOf('aiSummaryStale: false')

    expect(generationPosition).toBeGreaterThanOrEqual(0)
    expect(staleClearPosition).toBeGreaterThan(generationPosition)
    expect(source).toContain('aiSummaryUpdatedAt: now')
  })

  it('marks the stored summary stale when recruiter screening adds material evidence', () => {
    const source = readSource('server/api/applications/[id]/screening/complete.post.ts')

    expect(source).toContain('aiSummaryStale: true')
    expect(source).toContain("type: 'recruiter_screening'")
    expect(source).toContain('responses')
  })
})

describe('PDS AI Candidate Summary evidence policy', () => {
  it('prevents invented facts and unsupported late-round briefs', () => {
    const source = readSource('server/utils/ai/pdsCandidateSummary.ts')

    expect(source).toContain('Never invent interview feedback')
    expect(source).toContain('Never convert absence of evidence into evidence of absence')
    expect(source).toContain('Do not create a Hiring Manager, HOD or HR brief from resume or recruiter evidence alone')
  })

  it('treats workflow status and Current Fit as recorded facts rather than AI-controlled fields', () => {
    const source = readSource('server/utils/ai/pdsCandidateSummary.ts')

    expect(source).toContain('Treat CONFIRMED STATUS and CURRENT FIT as recorded workflow facts')
    expect(source).toContain('do not silently upgrade, downgrade or overwrite them')
  })

  it('allows a final brief only for a confirmed late or final workflow outcome', () => {
    const source = readSource('server/utils/ai/pdsCandidateSummary.ts')

    expect(source).toContain('finalBrief: return null unless CONFIRMED STATUS itself represents a meaningful late/final workflow outcome')
    expect(source).toContain('An AI recommendation, Current Fit label, resume score, screening recommendation or planned next step is not a final outcome')
    expect(source).toContain('Do not imply that AI made the hiring decision')
  })
})
