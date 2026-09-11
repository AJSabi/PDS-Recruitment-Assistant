import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(path, 'utf8')

describe('PDS resume identity review UX', () => {
  it('shows field-level parser confidence/source and requires recruiter confirmation before resume-backed creation', () => {
    const modal = read('app/components/ApplyCandidateModal.vue')
    expect(modal).toContain('resumeIdentity.nameConfidence')
    expect(modal).toContain('resumeIdentity.emailConfidence')
    expect(modal).toContain('resumeIdentity.phoneConfidence')
    expect(modal).toContain('identitySourceLabel(resumeIdentity.nameSource)')
    expect(modal).toContain('emailSourceLabel(resumeIdentity.emailSource)')
    expect(modal).toContain('phoneSourceLabel(resumeIdentity.phoneSource)')
    expect(modal).toContain('data-testid="resume-field-confidence"')
    expect(modal).toContain('data-testid="resume-review-reasons"')
    expect(modal).toContain('resumeIdentity.reviewReasons')
    expect(modal).toContain('data-testid="resume-identity-review"')
    expect(modal).toContain('data-testid="resume-identity-confirm"')
    expect(modal).toContain("if (resumeFile.value && !identityReviewed.value)")
    expect(modal).toContain('Review and confirm the candidate identity before creating the candidate.')
    expect(modal).toContain('Editing an identity field will require confirmation again.')
  })

  it('keeps parsed values editable and does not create a candidate from the parser endpoint', () => {
    const modal = read('app/components/ApplyCandidateModal.vue')
    const parserEndpoint = read('server/api/jobs/[id]/resume-identity.post.ts')
    expect(modal).toContain('v-model="newCandidate.firstName"')
    expect(modal).toContain('v-model="newCandidate.email"')
    expect(parserEndpoint).toContain('identity: inferResumeIdentity')
    expect(parserEndpoint).not.toContain('db.insert(candidate)')
  })

  it('preserves newer duplicate resume history instead of replacing the old resume', () => {
    const modal = read('app/components/ApplyCandidateModal.vue')
    expect(modal).toContain('it is added to Documents while previous resumes remain preserved')
    expect(modal).toContain('Added as a new resume document; earlier resumes are retained.')
    expect(modal).not.toContain('Upload a new resume only when you want to replace it with a newer version.')
  })

  it('preserves central candidate dedupe order and intake requirements', () => {
    const intake = read('server/api/jobs/[id]/candidate-intake.post.ts')
    const identityCheck = read('server/api/jobs/[id]/candidate-identity-check.post.ts')
    const matcher = read('server/utils/candidateIdentityMatch.ts')
    const schema = read('server/utils/schemas/candidateIntake.ts')
    expect(intake).toContain('findCandidateIdentityMatch(orgId, { email, phone: body.phone })')
    expect(identityCheck).toContain('findCandidateIdentityMatch(orgId, body)')
    expect(intake).toContain("dedupeOrder: 'email_then_phone'")
    expect(matcher.indexOf('const emailMatch')).toBeLessThan(matcher.indexOf('const phoneMatch'))
    expect(schema).toContain('lastName: z.string().trim().max(100).optional()')
  })
})
