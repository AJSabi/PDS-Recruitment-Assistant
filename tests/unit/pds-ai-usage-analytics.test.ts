import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readSource = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

describe('PDS AI usage analytics governance', () => {
  it('restricts AI usage analytics to recruitment admins', () => {
    const source = readSource('server/api/dashboard/ai-usage.get.ts')
    expect(source).toContain('assertRecruitmentAdmin')
    expect(source).toContain("requirePermission(event, { application: ['read'] })")
  })

  it('uses persisted analysis-run token telemetry', () => {
    const source = readSource('server/api/dashboard/ai-usage.get.ts')
    expect(source).toContain('analysisRun.promptTokens')
    expect(source).toContain('analysisRun.completionTokens')
    expect(source).toContain('analysisRun.status')
    expect(source).toContain("label: 'Last 30 days'")
  })

  it('prices only runs with unambiguous configured provider/model pricing', () => {
    const source = readSource('server/api/dashboard/ai-usage.get.ts')
    expect(source).toContain('inputPricePer1m')
    expect(source).toContain('outputPricePer1m')
    expect(source).toContain('if (unique.size === 1)')
    expect(source).toContain('row.unpricedRuns++')
    expect(source).toContain('It is not a provider invoice')
  })

  it('keeps the management navigation admin-scoped', () => {
    const source = readSource('app/components/AppTopBar.vue')
    expect(source).toContain("label: 'AI Usage'")
    expect(source).toContain("to: '/dashboard/management-ai-usage'")
    expect(source).toContain('canManageRequirements.value')
  })
})
