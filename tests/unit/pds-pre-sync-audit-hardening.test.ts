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

  it('routes the main requirement pipeline to the governed PDS Recruitment Workspace', () => {
    const pipeline = readSource('app/pages/dashboard/jobs/[id]/index.vue')
    const bridge = readSource('app/components/ScoreBreakdown.vue')
    expect(pipeline).toContain('/dashboard/recruitment/${selected.id}#recruiter-screening')
    expect(bridge).toContain('/dashboard/recruitment/${applicationId}#recruiter-screening')
    expect(pipeline).not.toContain('/dashboard/applications/${selected.id}#recruiter-screening')
    expect(bridge).not.toContain('/dashboard/applications/${applicationId}#recruiter-screening')
    expect(pipeline).toContain('Hiring Manager, HOD and HR interviews happen outside the application')
    expect(pipeline).not.toContain('capture Hiring Manager/HOD/HR evidence')
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
