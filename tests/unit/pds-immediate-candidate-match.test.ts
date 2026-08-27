import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readSource = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

describe('PDS immediate candidate match workflow', () => {
  it('assesses only the newly linked application rather than refreshing the whole database', () => {
    const modal = readSource('app/components/ApplyCandidateModal.vue')
    expect(modal).toContain(`/api/applications/${applicationId}/quick-match`)
    expect(modal).not.toContain('/talent-pool/sync')
  })

  it('requires the approved JD and Skill Matrix before calculating the percentage', () => {
    const source = readSource('server/api/applications/[id]/quick-match.post.ts')
    expect(source).toContain('skillMatrixApproved')
    expect(source).toContain('approvedMatrix')
    expect(source).toContain('Save the Active JD before AI candidate analysis.')
    expect(source).toContain('Approve the Skill Matrix before calculating the candidate match percentage.')
  })

  it('reuses a current paid assessment when resume and requirement revision have not changed', () => {
    const source = readSource('server/api/applications/[id]/quick-match.post.ts')
    expect(source).toContain('existingMatch?.resumeDocumentId === latestResume.id')
    expect(source).toContain('existingMatch.requirementVersion === requirementRevision')
    expect(source).toContain('reusedAssessment = true')
  })

  it('persists the score even below the working Candidate Pool threshold', () => {
    const source = readSource('server/api/applications/[id]/quick-match.post.ts')
    expect(source).toContain('db.insert(talentPoolMatch)')
    expect(source).toContain('provisionalFitScore: ranking.score')
    expect(source).toContain('visibleInCandidatePool: ranking.score >= 50')
  })

  it('keeps Current Fit human-controlled and offers recruiter validation instead of auto rejection', () => {
    const source = readSource('server/api/applications/[id]/quick-match.post.ts')
    const modal = readSource('app/components/ApplyCandidateModal.vue')
    expect(source).not.toContain('currentFit: ranking')
    expect(source).toContain('currentFit: profile.currentFit')
    expect(source).toContain('humanValidationAvailable: true')
    expect(modal).toContain('Validate via Recruiter Screening')
    expect(modal).toContain('The percentage is AI decision support, not a rejection decision.')
  })

  it('does not generate recruiter screening questions during the immediate score call', () => {
    const source = readSource('server/api/applications/[id]/quick-match.post.ts')
    expect(source).not.toContain('generatePdsScreeningQuestions')
    expect(source).not.toContain('recruiterScreeningSession')
  })
})
