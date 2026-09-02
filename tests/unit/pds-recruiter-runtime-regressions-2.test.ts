import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

describe('PDS recruiter runtime regression safeguards - follow-up', () => {
  it('accepts client-normalized skill IDs and nullable AI rationales', () => {
    const schema = source('server/utils/schemas/skillMatrix.ts')
    expect(schema).toContain("id: z.string().min(1).max(200)")
    expect(schema).toContain("rationale: z.string().trim().max(500).nullish()")
  })

  it('does not duplicate job and skill-matrix fetches in the JD shell', () => {
    const page = source('app/pages/dashboard/jobs/[id]/ai-analysis.vue')
    expect(page).not.toContain('const { data: matrixData }')
    expect(page).not.toContain('const { job } = useJob(jobId)')
    expect(page).toContain('profile.value?.skillMatrixApproved')
    expect(page).toContain('profile.value?.hasActiveJd')
  })

  it('surfaces setup state from the requirement profile endpoint', () => {
    const api = source('server/api/jobs/[id]/requirement-profile.get.ts')
    expect(api).toContain('hasActiveJd: Boolean(jobRecord.description?.trim())')
    expect(api).toContain('skillMatrixApproved: Boolean(state.skillMatrixApproved)')
  })

  it('prioritizes the current owner allocation and exposes opening duration', () => {
    const api = source('server/api/dashboard/stats.get.ts')
    expect(api).toContain('recruitmentRequirementState.ownerUserId')
    expect(api).toContain('recruitmentRequirementState.assignmentDate')
    expect(api).toContain(".limit(16)")
    expect(api).toContain('case when ${recruitmentRequirementState.ownerUserId} = ${userId} then 0 else 1 end')
    expect(api).toContain("openDays:")
  })

  it('makes operational dashboard queues navigable and shows allocation-based TAT', () => {
    const page = source('app/pages/dashboard/index.vue')
    expect(page).toContain("localePath('/dashboard/active-candidates')")
    expect(page).toContain("localePath('/dashboard/actions')")
    expect(page).toContain("localePath('/dashboard/closure-risk')")
    expect(page).toContain("if (!job.assignmentDate || job.openDays == null) return 'TAT not started'")
    expect(page).toContain('`${job.openDays} day${Number(job.openDays) === 1 ? \'\' : \'s\'} in TAT`')
  })

  it('recovers historical completed screenings that explicitly recommended reassess', () => {
    const profile = source('server/api/applications/[id]/recruitment-profile/index.get.ts')
    const generate = source('server/api/applications/[id]/screening/generate.post.ts')
    expect(profile).toContain('historicalReassess')
    expect(profile).toContain("lastStatus: 'reassess'")
    expect(generate).toContain('historicalReassess')
    expect(generate).toContain("lastStatus: 'reassess'")
    expect(generate).toContain('priorScreeningPreserved: true')
  })

  it('provides dedicated active candidate and closure risk queues', () => {
    expect(source('server/api/dashboard/active-candidates.get.ts')).toContain("not in ('closed','joined','not_proceeding')")
    expect(source('server/api/dashboard/closure-risk.get.ts')).toContain('daysToClosure')
    expect(source('app/pages/dashboard/active-candidates.vue')).toContain('/dashboard/recruitment/${row.id}')
    expect(source('app/pages/dashboard/closure-risk.vue')).toContain('/dashboard/jobs/${row.jobId}')
  })
})
