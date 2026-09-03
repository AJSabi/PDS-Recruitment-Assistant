import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readSource = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

describe('PDS immediate candidate match workflow', () => {
  it('assesses only the newly linked application rather than refreshing the whole database', () => {
    const modal = readSource('app/components/ApplyCandidateModal.vue')
    expect(modal).toContain('/api/applications/${applicationId}/quick-match')
    expect(modal).not.toContain('/talent-pool/sync')
  })

  it('uses an existing candidates stored resume when no newer resume is uploaded', () => {
    const modal = readSource('app/components/ApplyCandidateModal.vue')
    const quickMatchPosition = modal.indexOf('matchResult.value = await calculateImmediateMatch(result.applicationId)')
    const uploadGuardPosition = modal.indexOf('if (resumeFile.value)')
    expect(uploadGuardPosition).toBeGreaterThanOrEqual(0)
    expect(quickMatchPosition).toBeGreaterThan(uploadGuardPosition)
    expect(modal).toContain('The newest readable stored resume is used automatically for the immediate match.')
    expect(modal).toContain("'Add & Calculate Match'")
  })

  it('selects the newest readable stored resume rather than failing on a newer unreadable document', () => {
    const source = readSource('server/api/applications/[id]/quick-match.post.ts')
    expect(source).toContain('db.query.document.findMany')
    expect(source).toContain('orderBy: [desc(document.createdAt)]')
    expect(source).toContain('resumeCandidates.find')
    expect(source).toContain('extractResumeText(resume.parsedContent)')
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

  it('does not regress a candidate who is already progressing through recruitment', () => {
    const source = readSource('server/api/applications/[id]/quick-match.post.ts')
    expect(source).toContain("allowedNewAssessmentStatuses = new Set(['candidate_added', 'resume_received', 'reassess'])")
    expect(source).toContain("profile.lastStatus === 'resume_reviewed'")
    expect(source).toContain('profile.selectedResumeDocumentId === latestResume.id')
    expect(source).toContain('already progressing in recruitment')
  })

  it('persists the score even below the working Candidate Pool threshold without showing an active application in the Pool', () => {
    const source = readSource('server/api/applications/[id]/quick-match.post.ts')
    expect(source).toContain('db.insert(talentPoolMatch)')
    expect(source).toContain('provisionalFitScore: ranking.score')
    expect(source).toContain('visibleInCandidatePool: false')
  })

  it('keeps the legacy application status synchronized when Reassess returns to resume review', () => {
    const source = readSource('server/api/applications/[id]/quick-match.post.ts')
    expect(source).toContain('syncApplicationStatusForRecruitmentStage')
    expect(source).toContain("syncApplicationStatusForRecruitmentStage(orgId, applicationId, 'resume_reviewed')")
  })

  it('keeps Current Fit human-controlled and offers recruiter validation instead of auto rejection', () => {
    const source = readSource('server/api/applications/[id]/quick-match.post.ts')
    const modal = readSource('app/components/ApplyCandidateModal.vue')
    expect(source).not.toContain('currentFit: ranking')
    expect(source).toContain('currentFit: profile.currentFit')
    expect(source).toContain('humanValidationAvailable: true')
    expect(modal).toContain('Start Recruiter Screening')
    expect(modal).toContain('The percentage is AI decision support, not a rejection decision.')
  })

  it('does not generate recruiter screening questions during the immediate score call', () => {
    const source = readSource('server/api/applications/[id]/quick-match.post.ts')
    expect(source).not.toContain('generatePdsScreeningQuestions')
    expect(source).not.toContain('recruiterScreeningSession')
  })
})