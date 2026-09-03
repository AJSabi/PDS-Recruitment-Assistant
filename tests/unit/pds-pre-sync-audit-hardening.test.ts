import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readSource = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

describe('PDS pre-sync audit hardening', () => {
  it('keeps every requirement-owner write admin-only and cascades recruiter ownership', () => {
    const legacyOwner = readSource('server/api/jobs/[id]/recruitment-owner.put.ts')
    const allocation = readSource('server/api/requirement-allocations/[jobId].put.ts')

    for (const source of [legacyOwner, allocation]) {
      expect(source).toContain('assignedRecruiterId: body.ownerUserId')
      expect(source).toContain('applicationIds')
    }
    expect(legacyOwner).toContain('assertRecruitmentAdmin')
    expect(legacyOwner).toContain('await assertRecruitmentAdmin(orgId, session.user.id)')
    expect(allocation).toContain('if (!visibility.canSeeAll)')
  })

  it('keeps assignment, target closure and closure timing administrator-governed', () => {
    const timing = readSource('server/api/jobs/[id]/requirement-timing.put.ts')
    const profile = readSource('server/api/jobs/[id]/requirement-profile.put.ts')
    expect(timing).toContain('assertRecruitmentAdmin')
    expect(timing).toContain('await assertRecruitmentAdmin(orgId, session.user.id)')
    expect(profile).toContain('const visibility = await getRequirementVisibility(orgId, session.user.id)')
    expect(profile).toContain('const assignmentDate = visibility.canSeeAll')
    expect(profile).toContain('const targetClosureDate = visibility.canSeeAll')
  })

  it('does not seed application data from a production startup command', () => {
    const pkg = JSON.parse(readSource('package.json'))
    expect(pkg.scripts['start:railway']).not.toContain('db:seed')
    expect(pkg.scripts['start:railway']).not.toContain('db:reseed')
  })

  it('routes requirement and legacy application links to the governed PDS Recruitment Workspace', () => {
    const requirement = readSource('app/pages/dashboard/jobs/[id]/index.vue')
    const bridge = readSource('app/components/ScoreBreakdown.vue')
    const legacyDetail = readSource('app/pages/dashboard/applications/[id].vue')
    expect(requirement).toContain('/dashboard/recruitment/${app.id}')
    expect(bridge).toContain('/dashboard/recruitment/${applicationId}#recruiter-screening')
    expect(requirement).not.toContain('/dashboard/applications/${app.id}')
    expect(bridge).not.toContain('/dashboard/applications/${applicationId}#recruiter-screening')
    expect(legacyDetail).toContain('/dashboard/recruitment/${applicationId}')
    expect(legacyDetail).not.toContain('PdsInterviewEvidence')
    expect(requirement).toContain('Requirement Command Centre')
    expect(requirement).toContain('Open Candidate Pipeline')
  })

  it('keeps HM, HOD and HR progression manual and not evidence-gated in V1', () => {
    const stage = readSource('server/api/applications/[id]/stage/confirm.post.ts')
    expect(stage).toContain('Hiring Manager, HOD and HR discussions happen outside the application in V1.')
    expect(stage).toContain('The recruiter manually confirms each sequential stage here.')
    expect(stage).not.toContain('PdsInterviewEvidence')
  })

  it('keeps default AI configuration changes recruitment-admin only', () => {
    const source = readSource('server/api/ai-config/[id]/set-default.post.ts')
    expect(source).toContain('assertRecruitmentAdmin')
    expect(source).toContain('await assertRecruitmentAdmin(orgId, session.user.id)')
  })

  it('keeps requirement sub-nav actions client-only to avoid teleport hydration mismatch', () => {
    const source = readSource('app/components/JobSubNavActions.vue')
    expect(source).toContain('<ClientOnly>')
    expect(source).toContain('<Teleport to="#job-sub-nav-actions">')
  })

  it('keeps AI summary generation explicit, access-controlled and rate-limited', () => {
    const source = readSource('server/api/applications/[id]/candidate-summary/generate.post.ts')
    expect(source).toContain('assertApplicationAccess')
    expect(source).toContain('createRateLimiter')
    expect(source).toContain('generatePdsCandidateSummary')
  })

  it('keeps recruiter screening AI generation and interpretation on explicit POST routes', () => {
    const generate = readSource('server/api/applications/[id]/screening/generate.post.ts')
    const interpret = readSource('server/api/applications/[id]/screening/interpret.post.ts')
    for (const source of [generate, interpret]) {
      expect(source).toContain('assertApplicationAccess')
      expect(source).toContain('createRateLimiter')
    }
  })
})
