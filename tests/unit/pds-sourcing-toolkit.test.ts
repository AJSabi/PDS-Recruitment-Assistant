import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

describe('PDS sourcing toolkit', () => {
  it('generates JD-grounded major skills and a Boolean portal search only on explicit recruiter action', () => {
    const ai = source('server/utils/ai/pdsSourcingToolkit.ts')
    const api = source('server/api/jobs/[id]/sourcing/generate.post.ts')
    expect(ai).toContain('Return 5-12 concise major skill sets')
    expect(ai).toContain('Produce one practical Boolean string')
    expect(ai).toContain('If feedback is supplied, revise the search')
    expect(api).toContain("requirePermission(event, { scoring: ['create'] })")
    expect(api).toContain('assertRequirementAccess')
    expect(api).toContain('generatePdsSourcingToolkit')
  })

  it('keeps recruiter edits separate from Skill Matrix approval and reassessment governance', () => {
    const save = source('server/api/jobs/[id]/sourcing/index.put.ts')
    expect(save).toContain('majorSkills')
    expect(save).toContain('booleanSearch')
    expect(save).toContain('recruiterFeedback')
    expect(save).not.toContain('flagRequirementChange')
    expect(save).not.toContain('approvedMatrix')
  })

  it('lets recruiters manually edit, save, copy and refresh the Boolean string with feedback', () => {
    const ui = source('app/components/PdsSourcingToolkit.vue')
    expect(ui).toContain('Major Skill Sets Required as per JD')
    expect(ui).toContain('Boolean Search String for Job Portal')
    expect(ui).toContain('Recruiter Feedback for AI Refresh')
    expect(ui).toContain('Refresh with AI')
    expect(ui).toContain('Save Recruiter Changes')
    expect(ui).toContain('copyBoolean')
  })

  it('exposes the sourcing toolkit from the job actions menu', () => {
    const nav = source('app/components/JobSubNavActions.vue')
    expect(nav).toContain('/sourcing`)')
    expect(nav).toContain('Sourcing Toolkit')
  })
})
