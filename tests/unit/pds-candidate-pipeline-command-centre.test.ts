import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readSource = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

describe('PDS candidate pipeline command centre', () => {
  it('uses governed recruitment stages instead of legacy ATS status as the board model', () => {
    const source = readSource('app/pages/dashboard/jobs/[id]/candidates.vue')
    expect(source).toContain('Candidate Pipeline')
    expect(source).toContain("recruitmentStatus")
    expect(source).toContain("label: 'Recruiter Screening'")
    expect(source).toContain("label: 'Interview'")
    expect(source).toContain("label: 'Offer'")
    expect(source).not.toContain('STATUS_OPTIONS')
    expect(source).not.toContain('scoreMin')
  })

  it('shows recruiter action, stage ageing and operational attention on candidate cards', () => {
    const source = readSource('app/pages/dashboard/jobs/[id]/candidates.vue')
    expect(source).toContain('data-testid="candidate-pipeline-card"')
    expect(source).toContain('data-testid="candidate-current-stage"')
    expect(source).toContain('data-testid="candidate-stage-age"')
    expect(source).toContain('data-testid="candidate-next-action"')
    expect(source).toContain('Follow-up due')
    expect(source).toContain('app.nextAction')
    expect(source).toContain('app.currentFit')
  })

  it('derives stage age from persisted stage-change evidence', () => {
    const source = readSource('server/api/applications/index.get.ts')
    expect(source).toContain('recruitmentEvidence')
    expect(source).toContain("eq(recruitmentEvidence.type, 'stage_change')")
    expect(source).toContain('lastMovementByApplication')
    expect(source).toContain('lastMovementAt')
  })

  it('keeps candidate progression inside the governed detail workflow', () => {
    const source = readSource('app/pages/dashboard/jobs/[id]/candidates.vue')
    expect(source).toContain('<CandidateDetailSidebar')
    expect(source).toContain('@updated="handleSidebarUpdated"')
    expect(source).not.toContain('$fetch(`/api/applications/${')
    expect(source).not.toContain("method: 'PATCH'")
    expect(source).not.toContain("method: 'PUT'")
  })
})
