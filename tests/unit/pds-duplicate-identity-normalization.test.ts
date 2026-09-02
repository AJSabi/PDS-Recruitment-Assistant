import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { normalizeCandidateEmail, normalizeCandidatePhone } from '../../server/utils/candidateIdentityMatch'

const identityCheck = readFileSync('server/api/jobs/[id]/candidate-identity-check.post.ts', 'utf8')
const intake = readFileSync('server/api/jobs/[id]/candidate-intake.post.ts', 'utf8')
const matcher = readFileSync('server/utils/candidateIdentityMatch.ts', 'utf8')

describe('PDS duplicate identity normalization', () => {
  it('normalizes email without provider-specific fuzzy rewriting', () => {
    expect(normalizeCandidateEmail('  Rahul.Sharma@Example.COM ')).toBe('rahul.sharma@example.com')
    expect(normalizeCandidateEmail('rahul+sales@example.com')).toBe('rahul+sales@example.com')
  })

  it('normalizes common Indian phone formats to the same canonical number', () => {
    expect(normalizeCandidatePhone('+91 98765 43210')).toBe('9876543210')
    expect(normalizeCandidatePhone('09876543210')).toBe('9876543210')
    expect(normalizeCandidatePhone('98765-43210')).toBe('9876543210')
  })

  it('does not truncate non-Indian international numbers', () => {
    expect(normalizeCandidatePhone('+44 20 7946 0958')).toBe('442079460958')
  })

  it('keeps email-first then phone-second matching in one shared server helper', () => {
    expect(matcher.indexOf('const emailMatch')).toBeLessThan(matcher.indexOf('const phoneMatch'))
    expect(matcher).toContain("if (emailMatch) return { basis: 'email'")
    expect(matcher).toContain("if (phoneMatch) return { basis: 'phone'")
    expect(identityCheck).toContain('findCandidateIdentityMatch(orgId, body)')
    expect(intake).toContain('findCandidateIdentityMatch(orgId, { email, phone: body.phone })')
  })

  it('matches formatted historical phone values without fuzzy name matching', () => {
    expect(matcher).toContain("regexp_replace(coalesce(${candidate.phone}, ''), '[^0-9]', '', 'g')")
    expect(matcher).toContain('91${normalized}')
    expect(matcher).toContain('0${normalized}')
    expect(matcher).not.toContain('firstName')
    expect(matcher).not.toContain('lastName')
  })

  it('uses canonical lookup when checking a recruiter-requested email refresh', () => {
    expect(intake).toContain('findCandidateIdentityMatch(')
    expect(intake).toContain('{ excludeCandidateId: candidateId }')
    expect(intake).toContain("duplicateEmailMatch?.basis === 'email'")
  })
})
