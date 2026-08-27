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

  it('honors Hold and Reassess as actual screening outcomes instead of silently offering HM', () => {
    const source = readSource('server/api/applications/[id]/screening/complete.post.ts')

    expect(source).toContain("if (decision === 'hold_for_comparison') return 'hold_for_comparison'")
    expect(source).toContain("if (decision === 'reassess') return 'reassess'")
    expect(source).toContain('const finalStatus = completionStageForDecision(body.recommendedNextStep)')
    expect(source).toContain('lastStatus: finalStatus')
    expect(source).toContain('syncApplicationStatusForRecruitmentStage(orgId, applicationId, finalStatus)')
    expect(source).toContain('resultingStage: finalStatus')
  })

  it('requires an explicit recruiter decision before HM when screening asks for recruiter judgement', () => {
    const lifecycle = readSource('app/components/PdsRecruitmentLifecycle.vue')

    expect(lifecycle).toContain("props.profile?.nextAction === 'Recruiter Decision Required'")
    expect(lifecycle).toContain("props.profile?.nextAction !== 'Proceed to Hiring Manager Round'")
    expect(lifecycle).toContain('Confirm Recruiter Decision: Proceed to Hiring Manager')
    expect(lifecycle).toContain("confirmStage('hiring_manager_round_pending')")
  })

  it('keeps HM, HOD and HR interviews external while recruiters manually move stages', () => {
    const stageApi = readSource('server/api/applications/[id]/stage/confirm.post.ts')
    const lifecycle = readSource('app/components/PdsRecruitmentLifecycle.vue')

    expect(stageApi).toContain('HM, HOD and HR discussions happen outside the application')
    expect(stageApi).not.toContain('requiredEvidenceForCompletedStage')
    expect(stageApi).not.toContain('Record ${roundLabel} interview evidence before marking this round completed.')
    expect(stageApi).toContain('manualStageMovement: true')
    expect(lifecycle).toContain('Hiring Manager, HOD and HR rounds happen manually outside the application')
    expect(lifecycle).toContain('the recruiter only records each stage movement here')
    expect(lifecycle).toContain('Mark Hiring Manager Round Completed')
    expect(lifecycle).toContain('Mark HOD Round Completed')
    expect(lifecycle).toContain('Mark HR Round Completed')
  })

  it('keeps stage changes human-confirmed, sequential, access-controlled and auditable', () => {
    const source = readSource('server/api/applications/[id]/stage/confirm.post.ts')

    expect(source).toContain('assertApplicationAccess')
    expect(source).toContain('CONFIRMED_STAGE_TRANSITIONS[profile.lastStatus]')
    expect(source).toContain("type: 'stage_change'")
    expect(source).toContain("event: 'stage_confirmed'")
    expect(source).toContain('aiSummaryStale: true')
  })
})
