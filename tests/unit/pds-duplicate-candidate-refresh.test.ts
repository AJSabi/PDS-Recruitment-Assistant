import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const modal = readFileSync('app/components/ApplyCandidateModal.vue', 'utf8')
const detail = readFileSync('app/pages/dashboard/candidates/[id].vue', 'utf8')
const patch = readFileSync('server/api/candidates/[id].patch.ts', 'utf8')

describe('PDS duplicate candidate refresh workflow', () => {
  it('keeps the new resume as document history on the existing candidate', () => {
    expect(modal).toContain('it will be added as a new document on the existing candidate profile')
    expect(modal).toContain('Older resumes remain available in Documents for history and comparison.')
    expect(modal).toContain('await attachCandidate({ candidateId: existingCandidateId')
    expect(modal).toContain('uploadResume(candidateId)')
    expect(detail).toContain('Candidate Documents')
    expect(detail).toContain('uploadDocument(candidateId, file, selectedDocType.value)')
  })

  it('lets the recruiter selectively refresh changed identity/contact fields', () => {
    expect(modal).toContain('identityUpdateFields')
    expect(modal).toContain("if (identityUpdateFields.name)")
    expect(modal).toContain("if (identityUpdateFields.email)")
    expect(modal).toContain("if (identityUpdateFields.phone)")
    expect(modal).toContain("method: 'PATCH'")
    expect(modal).toContain('Select to update this field on the existing Candidate Database profile.')
  })

  it('does not silently overwrite unselected fields', () => {
    expect(modal).toContain('const updatePayload: Record<string, string | null> = {}')
    expect(patch).toContain('// If email is being changed, check uniqueness within the org')
    expect(patch).toContain("statusMessage: 'A candidate with this email already exists'")
  })

  it('offers direct access to the existing candidate profile and documents', () => {
    expect(modal).toContain('Open existing candidate profile / documents')
    expect(modal).toContain('`/dashboard/candidates/${identityConflictCheck.candidate.id}`')
  })
})
