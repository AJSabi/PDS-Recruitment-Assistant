import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const modal = readFileSync('app/components/ApplyCandidateModal.vue', 'utf8')
const detail = readFileSync('app/pages/dashboard/candidates/[id].vue', 'utf8')
const intake = readFileSync('server/api/jobs/[id]/candidate-intake.post.ts', 'utf8')
const intakeSchema = readFileSync('server/utils/schemas/candidateIntake.ts', 'utf8')

describe('PDS duplicate candidate refresh workflow', () => {
  it('keeps the new resume as document history on the existing candidate', () => {
    expect(modal).toContain('it will be added as a new document on the existing candidate profile')
    expect(modal).toContain('Older resumes remain available in Documents for history and comparison.')
    expect(modal).toContain('candidateId: existingCandidateId')
    expect(modal).toContain('uploadResume(candidateId)')
    expect(detail).toContain('Candidate Documents')
    expect(detail).toContain('uploadDocument(candidateId, file, selectedDocType.value)')
  })

  it('lets the recruiter selectively request identity/contact refreshes without a separate PATCH', () => {
    expect(modal).toContain('identityUpdateFields')
    expect(modal).toContain("if (identityUpdateFields.name) refreshedFields.push('name')")
    expect(modal).toContain("if (identityUpdateFields.email) refreshedFields.push('email')")
    expect(modal).toContain("if (identityUpdateFields.phone) refreshedFields.push('phone')")
    expect(modal).toContain('reviewedIdentity')
    expect(modal).not.toContain("await $fetch(`/api/candidates/${existingCandidateId}`, { method: 'PATCH'")
    expect(modal).toContain('Select to update this field on the existing Candidate Database profile.')
  })

  it('does not silently overwrite unselected fields', () => {
    expect(intake).toContain("if (resolutionAudit.refreshedFields.includes('name'))")
    expect(intake).toContain("if (resolutionAudit.refreshedFields.includes('email'))")
    expect(intake).toContain("if (resolutionAudit.refreshedFields.includes('phone'))")
    expect(intake).toContain("statusMessage: 'A candidate with this email already exists'")
  })

  it('offers direct access to the existing candidate profile and documents', () => {
    expect(modal).toContain('Open existing candidate profile / documents')
    expect(modal).toContain('`/dashboard/candidates/${identityConflictCheck.candidate.id}`')
  })

  it('persists recruiter-confirmed conflict resolution even when no field is refreshed', () => {
    expect(modal).toContain("const refreshedFields: Array<'name' | 'email' | 'phone'> = []")
    expect(modal).toContain('identityConflictResolution')
    expect(modal).toContain('confirmed: true')
    expect(modal).toContain('reviewedIdentity')
    expect(intakeSchema).toContain('identityConflictResolution: identityConflictResolutionSchema.optional()')
    expect(intakeSchema).toContain('reviewedIdentity: reviewedIdentitySchema')
    expect(intake).toContain("event: 'identity_conflict_resolved'")
    expect(intake).toContain("source: 'candidate_identity_review'")
    expect(intake).toContain('matchBasis: resolutionAudit.matchBasis')
    expect(intake).toContain('conflictFields: resolutionAudit.conflictFields')
    expect(intake).toContain('refreshedFields: resolutionAudit.refreshedFields')
  })

  it('keeps raw identity values out of duplicate-resolution audit metadata', () => {
    const auditStart = intake.indexOf("event: 'identity_conflict_resolved'")
    const auditEnd = intake.indexOf('applicationId:', auditStart)
    const auditBlock = intake.slice(auditStart, auditEnd)
    expect(auditBlock).toContain('matchBasis: resolutionAudit.matchBasis')
    expect(auditBlock).toContain('conflictFields: resolutionAudit.conflictFields')
    expect(auditBlock).toContain('refreshedFields: resolutionAudit.refreshedFields')
    expect(auditBlock).not.toContain('candidateEmail')
    expect(auditBlock).not.toContain('firstName')
    expect(auditBlock).not.toContain('lastName')
    expect(auditBlock).not.toContain('phone:')
  })

  it('performs identity refresh and audit inside one database transaction', () => {
    expect(intake).toContain('const result = await db.transaction(async (tx) =>')
    expect(intake).toContain('await tx.update(candidate)')
    expect(intake).toContain('await tx.insert(activityLog).values')
  })
})
