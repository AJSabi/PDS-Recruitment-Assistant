import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CONFIRMED_STAGE_TRANSITIONS } from '../../server/utils/schemas/recruitmentStage'

const readSource = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

describe('PDS recruitment stage integrity', () => {
  it('keeps the intended sequential interview path to offer', () => {
    expect(CONFIRMED_STAGE_TRANSITIONS.recruiter_screening_completed).toContain('hiring_manager_round_pending')
    expect(CONFIRMED_STAGE_TRANSITIONS.hiring_manager_round_pending).toContain('hiring_manager_round_completed')
    expect(CONFIRMED_STAGE_TRANSITIONS.hiring_manager_round_completed).toContain('hod_round_pending')
    expect(CONFIRMED_STAGE_TRANSITIONS.hod_round_pending).toContain('hod_round_completed')
    expect(CONFIRMED_STAGE_TRANSITIONS.hod_round_completed).toContain('hr_round_pending')
    expect(CONFIRMED_STAGE_TRANSITIONS.hr_round_pending).toContain('hr_round_completed')
    expect(CONFIRMED_STAGE_TRANSITIONS.hr_round_completed).toContain('offer_stage')
    expect(CONFIRMED_STAGE_TRANSITIONS.offer_stage).toEqual(expect.arrayContaining(['offer_accepted', 'offer_declined']))
    expect(CONFIRMED_STAGE_TRANSITIONS.offer_accepted).toContain('joined')
    expect(CONFIRMED_STAGE_TRANSITIONS.joined).toContain('closed')
    expect(CONFIRMED_STAGE_TRANSITIONS.closed).toEqual([])
  })

  it('requires round-specific evidence before HM, HOD or HR can be marked completed', () => {
    const source = readSource('server/api/applications/[id]/stage/confirm.post.ts')

    expect(source).toContain("hiring_manager_round_completed: 'hiring_manager_interview'")
    expect(source).toContain("hod_round_completed: 'hod_interview'")
    expect(source).toContain("hr_round_completed: 'hr_interview'")
    expect(source).toContain('requiredEvidenceForCompletedStage[body.stage]')
    expect(source).toContain('eq(recruitmentEvidence.type, requiredEvidenceType)')
    expect(source).toContain('Record ${roundLabel} interview evidence before marking this round completed.')
  })

  it('binds interview evidence to the active HM, HOD or HR round', () => {
    const source = readSource('server/api/applications/[id]/interview-evidence/index.post.ts')

    expect(source).toContain("hiring_manager_round_pending: 'hiring_manager'")
    expect(source).toContain("hod_round_pending: 'hod'")
    expect(source).toContain("hr_round_pending: 'hr'")
    expect(source).toContain('expectedInterviewTypeByStatus[profile.lastStatus]')
    expect(source).toContain('body.interviewType !== expectedInterviewType')
  })

  it('keeps stage changes human-confirmed, access-controlled and auditable', () => {
    const source = readSource('server/api/applications/[id]/stage/confirm.post.ts')

    expect(source).toContain('assertApplicationAccess')
    expect(source).toContain('CONFIRMED_STAGE_TRANSITIONS[profile.lastStatus]')
    expect(source).toContain("type: 'stage_change'")
    expect(source).toContain("event: 'stage_confirmed'")
    expect(source).toContain('aiSummaryStale: true')
  })
})
