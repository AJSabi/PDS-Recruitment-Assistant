import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

describe('PDS recruiter daily KPI telemetry', () => {
  it('uses recruiter-scoped immutable evidence for daily and average activity', () => {
    const api = source('server/api/dashboard/recruiter-daily-kpis.get.ts')
    expect(api).toContain("const TIME_ZONE = 'Asia/Kolkata'")
    expect(api).toContain('const AVERAGE_DAYS = 30')
    expect(api).toContain('eq(recruitmentEvidence.createdBy, userId)')
    expect(api).toContain("eq(recruitmentEvidence.type, 'sourcing')")
    expect(api).toContain("eq(recruitmentEvidence.type, 'stage_change')")
    expect(api).not.toContain('assignedRecruiterId, userId')
  })

  it('covers sourcing, screening, interview, offer and joining movement', () => {
    const api = source('server/api/dashboard/recruiter-daily-kpis.get.ts')
    for (const stage of [
      'recruiter_screening_completed',
      'hiring_manager_round_pending',
      'hiring_manager_round_completed',
      'hod_round_pending',
      'hod_round_completed',
      'hr_round_pending',
      'hr_round_completed',
      'offer_stage',
      'offer_accepted',
      'offer_declined',
      'joined',
    ]) expect(api).toContain(stage)
  })

  it('persists the acting recruiter when an internally sourced application is created', () => {
    const createApplication = source('server/api/applications/index.post.ts')
    const schema = source('server/database/schema/recruitmentWorkflow.ts')
    expect(schema).toContain("| 'sourcing'")
    expect(createApplication).toContain("type: 'sourcing'")
    expect(createApplication).toContain("payload: { event: 'candidate_sourced', source: 'recruiter_sourcing' }")
    expect(createApplication).toContain('createdBy: session.user.id')
  })

  it('shows the personal recruiter pulse only in the recruiter-scoped dashboard', () => {
    const dashboard = source('app/pages/dashboard/index.vue')
    expect(dashboard).toContain('data-testid="recruiter-daily-performance-pulse"')
    expect(dashboard).toContain('v-if="scope.allocatedOnly"')
    expect(dashboard).toContain('My Daily Recruitment Pulse')
    for (const label of [
      'Candidates sourced',
      'Recruiter screenings',
      'Rounds scheduled',
      'Rounds completed',
      'Offers raised',
      'Offers accepted',
      'Offers declined',
      'Joined',
    ]) expect(dashboard).toContain(label)
  })
})
