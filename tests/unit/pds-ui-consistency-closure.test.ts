import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readSource = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

describe('PDS final recruitment UI consistency', () => {
  it('keeps requirement navigation aligned with the command-centre architecture', () => {
    const topbar = readSource('app/components/AppTopBar.vue')

    expect(topbar).toContain("{ id: 'overview', label: 'Overview', to: base }")
    expect(topbar).toContain("{ id: 'pipeline', label: 'Candidate Pipeline', to: `${base}/candidates` }")
    expect(topbar).toContain("{ id: 'jd-skill-matrix', label: 'JD & Skill Matrix', to: `${base}/ai-analysis` }")
    expect(topbar).toContain("{ id: 'candidate-match', label: 'Candidate Match', to: `${base}/pds-ranking` }")
    expect(topbar).not.toContain("{ id: 'pipeline', label: 'Candidate Pipeline', to: base }")
  })

  it('uses Candidate Match terminology in requirement setup navigation', () => {
    const setup = readSource('app/pages/dashboard/jobs/[id]/ai-analysis.vue')

    expect(setup).toContain("{ label: 'Candidate Match'")
    expect(setup).toContain('>Overview</NuxtLink>')
    expect(setup).toContain('>Candidate Match</NuxtLink>')
    expect(setup).not.toContain('>AI Candidate Pool</NuxtLink>')
  })

  it('provides a responsive candidate database rather than a desktop-only wide table', () => {
    const database = readSource('app/pages/dashboard/pds-candidates.vue')

    expect(database).toContain('data-testid="candidate-database-mobile-cards"')
    expect(database).toContain('data-testid="candidate-database-desktop-table"')
    expect(database).toContain("filterClass('active')")
    expect(database).toContain("filterClass('database_only')")
    expect(database).toContain('/dashboard/recruitment/${row.latestApplicationId}')
  })
})
