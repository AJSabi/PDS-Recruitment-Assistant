import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(path, 'utf8')

describe('PDS recruitment workflow hardening', () => {
  it('keeps the governed recruitment stage route allocation-aware and transition constrained', () => {
    const stage = read('server/api/applications/[id]/stage/confirm.post.ts')
    expect(stage).toContain('await assertApplicationAccess(orgId, session.user.id, applicationId)')
    expect(stage).toContain('CONFIRMED_STAGE_TRANSITIONS[profile.lastStatus]')
    expect(stage).toContain('if (!allowed.includes(body.stage))')
    expect(stage).toContain("stagesRequiringDecisionNote.has(body.stage)")
  })

  it('commits detailed stage, coarse application status and stage evidence atomically', () => {
    const stage = read('server/api/applications/[id]/stage/confirm.post.ts')
    expect(stage).toContain('await db.transaction(async (tx) =>')
    expect(stage).toContain('tx.update(recruitmentApplicationProfile)')
    expect(stage).toContain('tx.update(application)')
    expect(stage).toContain('tx.insert(recruitmentEvidence)')
    expect(stage).toContain('coarseStatusForRecruitmentStage(body.stage)')
    expect(stage).not.toContain('await syncApplicationStatusForRecruitmentStage')
  })

  it('prevents the generic application patch from bypassing the PDS stage workflow', () => {
    const patch = read('server/api/applications/[id].patch.ts')
    expect(patch).toContain('await assertApplicationAccess(orgId, session.user.id, id)')
    expect(patch).toContain('This application uses the PDS recruitment workflow.')
    expect(patch).toContain('APPLICATION_STATUS_TRANSITIONS[current.status]')
  })

  it('keeps TAT based on allocation rather than requirement creation', () => {
    const tat = read('server/api/recruitment/tat.get.ts')
    expect(tat).toContain('assertRecruitmentAdmin')
    expect(tat).toContain('assignmentDate')
    expect(tat).not.toContain('requirement.createdAt')
    expect(tat).toContain('allocated')
  })

  it('keeps duplicate candidate intake transactional and canonical-match based', () => {
    const intake = read('server/api/jobs/[id]/candidate-intake.post.ts')
    expect(intake).toContain('findCandidateIdentityMatch')
    expect(intake).toContain('await db.transaction(async (tx) =>')
    expect(intake).toContain("dedupeOrder: 'email_then_phone'")
  })
})
