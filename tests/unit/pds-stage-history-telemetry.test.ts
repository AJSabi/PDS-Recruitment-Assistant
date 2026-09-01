import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readSource = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

describe('PDS recruitment stage history telemetry', () => {
  it('centralizes automatic stage history as stage_change evidence', () => {
    const source = readSource('server/utils/recruitmentStageHistory.ts')
    expect(source).toContain("type: 'stage_change'")
    expect(source).toContain("event: 'stage_changed'")
    expect(source).toContain('from: input.from')
    expect(source).toContain('to: input.to')
    expect(source).toContain('source: input.source')
  })

  it('records resume selection and resume assessment stage movement', () => {
    const selection = readSource('server/api/applications/[id]/resume/select.post.ts')
    const assessment = readSource('server/api/applications/[id]/resume-assessment/index.put.ts')
    expect(selection).toContain('recordRecruitmentStageChange')
    expect(selection).toContain("source: 'resume_selection'")
    expect(selection).toContain("to: 'resume_received'")
    expect(assessment).toContain('recordRecruitmentStageChange')
    expect(assessment).toContain("source: 'resume_assessment'")
    expect(assessment).toContain("to: 'resume_reviewed'")
  })

  it('records recruiter screening start and completion outcomes', () => {
    const start = readSource('server/api/applications/[id]/screening/start.post.ts')
    const complete = readSource('server/api/applications/[id]/screening/complete.post.ts')
    expect(start).toContain('recordRecruitmentStageChange')
    expect(start).toContain("source: 'screening_start'")
    expect(start).toContain("to: 'recruiter_screening_pending'")
    expect(complete).toContain('recordRecruitmentStageChange')
    expect(complete).toContain("source: 'screening_completion'")
    expect(complete).toContain('to: finalStatus')
  })

  it('does not replace the governed manual confirmation audit trail', () => {
    const manual = readSource('server/api/applications/[id]/stage/confirm.post.ts')
    expect(manual).toContain("type: 'stage_change'")
    expect(manual).toContain("event: 'stage_confirmed'")
    expect(manual).toContain('manualStageMovement: true')
  })
})
