import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { findCandidateIdentityConflicts } from '../../server/utils/candidateIdentityConflict'

const read = (path: string) => readFileSync(path, 'utf8')

describe('PDS candidate identity conflict protection', () => {
  it('detects materially different names on an existing database identity', () => {
    const conflicts = findCandidateIdentityConflicts(
      { firstName: 'Rahul', lastName: 'Sharma', email: 'rahul@example.com', phone: '+91 98765 43210' },
      { firstName: 'Rakesh', lastName: 'Sharma', email: 'rahul@example.com', phone: '+91 98765 43210' },
    )
    expect(conflicts.map(c => c.field)).toContain('name')
    expect(conflicts.map(c => c.field)).not.toContain('email')
  })

  it('normalizes case, whitespace and phone punctuation before comparing', () => {
    expect(findCandidateIdentityConflicts(
      { firstName: 'Cher', lastName: '', email: 'CHER@example.com', phone: '+91 98-7654-3210' },
      { firstName: '  cher ', lastName: '', email: 'cher@example.com', phone: '919876543210' },
    )).toEqual([])
  })

  it('checks email first and phone second through the shared preflight matcher', () => {
    const endpoint = read('server/api/jobs/[id]/candidate-identity-check.post.ts')
    const matcher = read('server/utils/candidateIdentityMatch.ts')
    expect(endpoint).toContain('findCandidateIdentityMatch(orgId, body)')
    expect(endpoint).toContain('matchBasis: match.basis')
    expect(matcher.indexOf('const emailMatch')).toBeLessThan(matcher.indexOf('const phoneMatch'))
    expect(matcher).toContain("if (emailMatch) return { basis: 'email'")
    expect(matcher).toContain("if (phoneMatch) return { basis: 'phone'")
  })

  it('requires explicit recruiter confirmation before a conflicting existing identity is reused', () => {
    const modal = read('app/components/ApplyCandidateModal.vue')
    expect(modal).toContain('candidate-identity-conflict')
    expect(modal).toContain('candidate-identity-conflict-confirm')
    expect(modal).toContain('identityConflictConfirmed.value')
    expect(modal).toContain('Use this existing Candidate Database record.')
    expect(modal).toContain('selected any fields that should be refreshed')
    expect(modal).toContain('const existingCandidateId = identityConflictCheck.value.candidate.id')
    expect(modal).toContain('candidateId: existingCandidateId')
  })

  it('enforces the conflict guard at the intake API and recomputes match/conflict facts server-side', () => {
    const intake = read('server/api/jobs/[id]/candidate-intake.post.ts')
    expect(intake).toContain('findCandidateIdentityMatch(orgId, { email, phone: body.phone })')
    expect(intake).toContain('findCandidateIdentityConflicts(matchedCandidate, body)')
    expect(intake).toContain('Review the conflict and explicitly use the existing candidate record')
    expect(intake).toContain('const emailMatches = normalizeCandidateEmail(existingCandidate.email)')
    expect(intake).toContain('const phoneMatches = Boolean(normalizeCandidatePhone(existingCandidate.phone))')
    expect(intake).toContain('const conflicts = findCandidateIdentityConflicts(existingCandidate, reviewedIdentity)')
    expect(intake).toContain('const invalidRefreshField = refreshedFields.find')
  })

  it('applies selected identity updates and audit evidence atomically', () => {
    const intake = read('server/api/jobs/[id]/candidate-intake.post.ts')
    expect(intake).toContain('const result = await db.transaction(async (tx) =>')
    expect(intake).toContain('await tx.update(candidate)')
    expect(intake).toContain('await tx.insert(activityLog).values')
    expect(intake).toContain("event: 'identity_conflict_resolved'")
  })
})
