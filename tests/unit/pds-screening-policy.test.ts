import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = readFileSync('server/utils/ai/pdsScreening.ts', 'utf8')
const notInterestedApi = readFileSync('server/api/applications/[id]/screening/not-interested.post.ts', 'utf8')
const notInterestedUi = readFileSync('app/components/PdsCandidateNotInterested.vue', 'utf8')

describe('PDS recruiter screening policy', () => {
  it('caps recruiter screening at 10 questions', () => {
    expect(source).toContain("z.array(questionSchema).min(1).max(10)")
    expect(source).toContain('Generate no more than 10 questions')
  })

  it('prioritises unresolved Mandatory evidence before Preferred evidence', () => {
    expect(source).toContain('Mandatory skills marked requires_verification')
    expect(source).toContain('Mandatory skills marked no_evidence_found')
    expect(source).toContain('Mandatory skills marked partial_evidence')
    expect(source).toContain('Important Preferred skills with unresolved evidence')
  })

  it('requires candidate-specific evidence validation rather than generic interview questions', () => {
    expect(source).toContain("If this question could be asked unchanged to almost every candidate for the role, rewrite it")
    expect(source).toContain('Do not ask generic questions such as')
    expect(source).toContain('Tell me about yourself')
    expect(source).toContain("candidate's PERSONAL contribution")
  })

  it('focuses recruiter capture on ownership, scale and measurable outcomes', () => {
    expect(source).toContain('revenue/GM target and achievement')
    expect(source).toContain('deal size')
    expect(source).toContain('project scope')
    expect(source).toContain('Owned end-to-end / Co-owned / Supported / Exposure only / No direct experience / Other')
  })

  it('does not allow unresolved critical Mandatory evidence to become Strong Fit', () => {
    expect(source).toContain('must not be classified Strong Fit while a genuinely critical Mandatory requirement remains unsupported')
    expect(source).toContain('Significant Gap is an evidence-based assessment, not an automatic rejection instruction')
  })

  it('keeps the screening realistic for a 10-15 minute recruiter conversation', () => {
    expect(source).toContain('10-15 minute phone screening')
    expect(source).toContain('completed within 10-15 minutes')
    expect(source).toContain('30-90 seconds')
  })

  it('records Candidate Not Interested as a candidate decision, not recruiter rejection', () => {
    expect(notInterestedApi).toContain("lastStatus: 'not_proceeding'")
    expect(notInterestedApi).toContain("event: 'candidate_not_interested'")
    expect(notInterestedApi).toContain('candidateDecision: true')
    expect(notInterestedApi).toContain('recruiterRejection: false')
    expect(notInterestedApi).toContain('Candidate remains in the central Candidate Database')
  })

  it('allows Candidate Not Interested before or during screening and stops an active screening session', () => {
    expect(notInterestedApi).toContain("['resume_reviewed', 'recruiter_screening_pending']")
    expect(notInterestedApi).toContain("status: 'completed'")
    expect(notInterestedApi).toContain("syncApplicationStatusForRecruitmentStage(orgId, applicationId, 'not_proceeding')")
    expect(notInterestedApi).toContain("nextAction: 'Candidate Not Interested — Reassess or close application'")
  })

  it('offers practical candidate-decision reasons and keeps reopening governed through Reassess', () => {
    expect(notInterestedUi).toContain('Candidate Not Interested')
    expect(notInterestedUi).toContain('Not interested in the role')
    expect(notInterestedUi).toContain('Compensation not suitable')
    expect(notInterestedUi).toContain('Location not suitable')
    expect(notInterestedUi).toContain('Timing / availability not suitable')
    expect(notInterestedUi).toContain('may be reconsidered later through Reassess')
  })
})
