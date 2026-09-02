import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

describe('PDS recruiter runtime UX safeguards', () => {
  it('allows an allocated member recruiter to save and approve a PDS Skill Matrix without granting broad scoring update', () => {
    const api = source('server/api/jobs/[id]/skill-matrix/index.put.ts')
    expect(api).toContain("requirePermission(event, { scoring: ['create'] })")
    expect(api).toContain('assertRequirementAccess(orgId, session.user.id, jobId)')
    expect(api).not.toContain("scoring: ['update']")
  })

  it('allows explicit Skill Matrix AI generation for the allocated recruiter only', () => {
    const api = source('server/api/jobs/[id]/skill-matrix/generate.post.ts')
    expect(api).toContain("requirePermission(event, { scoring: ['create'] })")
    expect(api).toContain('assertRequirementAccess(orgId, session.user.id, jobId)')
    expect(api).toContain('generateSkillMatrixFromDescription')
    expect(api).not.toContain("scoring: ['update']")
  })

  it('keeps recruiter screening question generation allocation-scoped and gated by the canonical approved Skill Matrix', () => {
    const api = source('server/api/applications/[id]/screening/generate.post.ts')
    expect(api).toContain("requirePermission(event, { application: ['update'], scoring: ['create'] })")
    expect(api).toContain('assertApplicationAccess')
    expect(api).toContain('matrixRecord?.approvedAt')
    expect(api).toContain('matrixRecord?.approvedMatrix')
    expect(api).not.toContain('requirementState?.skillMatrixApproved')
    expect(api).toContain('Approve the Skill Matrix before generating screening questions')
  })

  it('never runs resume AI automatically on recruitment workspace page open', () => {
    const panel = source('app/components/PdsResumeAssessmentPanel.vue')
    const api = source('server/api/applications/[id]/resume-assessment/generate.post.ts')
    expect(panel).toContain('Run AI Resume Analysis')
    expect(panel).toContain('opening this page never spends AI credits')
    expect(panel).not.toContain('autoAttemptedForResume')
    expect(panel).not.toContain('runAiAnalysis(true)')
    expect(api).not.toContain('generatePdsScreeningQuestions')
    expect(api).not.toContain('recruiterScreeningSession')
    expect(api).toContain('screeningQuestionsGenerated: 0')
  })

  it('keeps Reassess intact when an explicit resume AI refresh is requested', () => {
    const api = source('server/api/applications/[id]/resume-assessment/generate.post.ts')
    expect(api).toContain("const remainsInReassess = profile.lastStatus === 'reassess'")
    expect(api).toContain("lastStatus: remainsInReassess ? 'reassess' : 'resume_reviewed'")
    expect(api).toContain("nextAction: remainsInReassess ? 'Revalidate recruiter screening'")
  })

  it('shows a stable Approved state instead of another Approve button for the current saved matrix', () => {
    const page = source('app/components/PdsJdSkillMatrix.vue')
    expect(page).toContain('const approvalCurrent = computed(() => approved.value && !dirty.value)')
    expect(page).toContain('<template v-if="approvalCurrent">')
    expect(page).toContain('Skill Matrix approved')
    expect(page).toContain('>Approved</div>')
  })

  it('makes the dashboard Actions Pending KPI open a real recruiter work queue', () => {
    const dashboard = source('app/pages/dashboard/index.vue')
    const queue = source('app/pages/dashboard/actions.vue')
    expect(dashboard).toContain("localePath('/dashboard/actions')")
    expect(dashboard).toContain('Actions Pending')
    expect(dashboard).toContain('Candidate follow-ups')
    expect(queue).toContain("useFetch('/api/dashboard/pending-actions'")
    expect(queue).toContain('/dashboard/recruitment/${row.id}')
  })

  it('keeps pending-action counts and rows limited to actionable candidates in active visible requirements', () => {
    const stats = source('server/api/dashboard/stats.get.ts')
    const queue = source('server/api/dashboard/pending-actions.get.ts')

    for (const api of [stats, queue]) {
      expect(api).toContain("job.status} in ('draft','open')")
      expect(api).toContain('isNotNull(recruitmentApplicationProfile.nextAction)')
      expect(api).toContain("trim(${recruitmentApplicationProfile.nextAction}) <> ''")
      expect(api).toContain("not in ('closed','joined','not_proceeding')")
    }
    expect(queue).toContain('getVisibleRequirementIds')
    expect(stats).toContain('getVisibleRequirementIds')
  })

  it('does not fetch property definitions merely by opening JD & Skill Matrix', () => {
    const subnav = source('app/components/JobSubNavActions.vue')
    expect(subnav).toMatch(/<PropertySchemaEditor\s+[\s\S]*?v-if="showPropertyEditor"/)
  })

  it('keeps Skill Matrix page-open free of implicit AI and Candidate Pool actions', () => {
    const page = source('app/components/PdsJdSkillMatrix.vue')
    expect(page).toContain("useFetch(() => `/api/jobs/${jobId}/skill-matrix`")
    expect(page).toContain("method: 'POST'")
    expect(page).toContain('@click="generateAiMatrix"')
    expect(page).not.toContain('talent-pool/sync')
    expect(page).not.toContain('candidate-database/refresh')
  })
})
