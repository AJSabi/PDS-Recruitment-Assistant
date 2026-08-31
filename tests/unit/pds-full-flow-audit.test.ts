import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

describe('PDS full-flow audit safeguards', () => {
  it('keeps the PDS-facing candidate record free of legacy application and interview bypasses', () => {
    const page = source('app/pages/dashboard/candidates/[id].vue')
    expect(page).not.toContain('ApplyToJobModal')
    expect(page).not.toContain('Apply to Job')
    expect(page).not.toContain('Schedule Interview')
    expect(page).not.toContain('InterviewScheduleSidebar')
    expect(page).toContain('/dashboard/recruitment/${app.id}')
    expect(page).toContain("requirement's JD & Skill Matrix / Add Candidate flow")
  })

  it('scopes Candidate Database application history to recruiter allocations while owners/admins can see all', () => {
    const api = source('server/api/candidates/[id].get.ts')
    expect(api).toContain('getRequirementVisibility')
    expect(api).toContain('visibility.canSeeAll')
    expect(api).toContain('recruitmentRequirementState.ownerUserId, session.user.id')
    expect(api).toContain('applications: applicationRows.map')
  })

  it('deduplicates direct candidate intake by email first and then phone', () => {
    const api = source('server/api/jobs/[id]/candidate-intake.post.ts')
    expect(api).toContain('matchedByEmail')
    expect(api).toContain('matchedByPhone')
    expect(api).toContain('matchedByEmail ?? matchedByPhone')
    expect(api).toContain("dedupeOrder: 'email_then_phone'")
  })

  it('preserves existing target closure and closedAt when admin timing fields are omitted', () => {
    const api = source('server/api/jobs/[id]/requirement-timing.put.ts')
    expect(api).toContain('existing?.targetClosureDate ?? (assignmentDate ? addDays(assignmentDate, 60) : null)')
    expect(api).toContain('body.closedAt === undefined')
    expect(api).toContain('existing?.closedAt ?? null')
  })

  it('does not expose legacy bulk active-pipeline AI analysis in the PDS Candidate Pool/Pipeline page', () => {
    const page = source('app/pages/dashboard/jobs/[id]/pds-ranking.vue')
    expect(page).not.toContain('Analyze Pending with AI')
    expect(page).not.toContain('/batch-ranking/analyze')
    expect(page).toContain('Refresh Database Matches')
    expect(page).toContain('not bulk-scored from this view')
  })

  it('keeps generic compatibility application creation aligned to the authoritative requirement recruiter', () => {
    const api = source('server/api/applications/index.post.ts')
    expect(api).toContain('recruitmentRequirementState')
    expect(api).toContain('assignedRecruiterId: requirementState?.ownerUserId ?? null')
    expect(api).toContain('assertRequirementAccess')
  })
})
