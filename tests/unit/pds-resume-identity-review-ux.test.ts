import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(path, 'utf8')

describe('PDS resume identity review UX', () => {
  it('shows parser confidence/source and requires recruiter confirmation before resume-backed creation', () => {
    const modal = read('app/components/ApplyCandidateModal.vue')
    expect(modal).toContain('resumeIdentity.nameConfidence')
    expect(modal).toContain('identitySourceLabel(resumeIdentity.nameSource)')
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

  it('preserves central candidate dedupe order and intake requirements', () => {
    const intake = read('server/api/jobs/[id]/candidate-intake.post.ts')
    const schema = read('server/utils/schemas/candidateIntake.ts')
    expect(intake).toContain('const matchedByEmail')
    expect(intake).toContain('const matchedByPhone = !matchedByEmail')
    expect(intake).toContain("dedupeOrder: 'email_then_phone'")
    expect(schema).toContain('Last name is required for a new candidate.')
  })
})
