import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

function source(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
}

describe('PDS runtime stability safeguards', () => {
  it('keeps requirement list fetch state isolated and refreshes all known requirement caches', () => {
    const jobs = source('app/composables/useJobs.ts')
    const job = source('app/composables/useJob.ts')

    expect(jobs).toContain("`jobs:${normalizedStatus.value ?? 'all'}`")
    expect(job).toContain("'jobs:all'")
    expect(job).toContain("'jobs:draft'")
    expect(job).toContain("'jobs:open'")
    expect(job).toContain("'pds-topbar-jobs'")
  })

  it('creates PDS requirement lifecycle state in the same transaction as the job', () => {
    const createJob = source('server/api/jobs/index.post.ts')
    expect(createJob).toContain('db.transaction')
    expect(createJob).toContain('tx.insert(recruitmentRequirementState)')
    expect(createJob).toContain('jobId,')
  })

  it('derives requirement tabs directly from the reactive route and exposes stable browser selectors', () => {
    const topbar = source('app/components/AppTopBar.vue')
    expect(topbar).toContain('route.params.id')
    expect(topbar).toContain("route.path.startsWith(`${jobsBase}/`)")
    expect(topbar).not.toContain('useRouteBaseName')
    expect(topbar).toContain('data-testid="requirement-tab-ribbon"')
    expect(topbar).toContain(':data-testid="`requirement-tab-${tab.id}`"')
    expect(topbar).toContain("id: 'requirement-settings'")
  })

  it('mounts requirement action teleports only after client hydration', () => {
    const actions = source('app/components/JobSubNavActions.vue')
    expect(actions).toContain('const isMounted = ref(false)')
    expect(actions).toContain('onMounted(() => { isMounted.value = true })')
    expect(actions).toContain('<Teleport v-if="isMounted" to="#job-sub-nav-actions">')
  })

  it('never generates a Skill Matrix merely by opening or refreshing the page', () => {
    const matrix = source('app/components/PdsJdSkillMatrix.vue')
    expect(matrix).toContain('@click="generateAiMatrix"')
    expect(matrix).toContain('Opening or refreshing this page will not spend AI credits.')
    expect(matrix).not.toContain('autoGenerationAttempted')
    expect(matrix).not.toContain('generateAiMatrix(true)')
    expect(matrix).not.toContain('prepared automatically')
  })

  it('keeps the dedicated AI Skill Matrix generation endpoint available and access scoped', () => {
    const generate = source('server/api/jobs/[id]/skill-matrix/generate.post.ts')
    expect(generate).toContain('assertRequirementAccess')
    expect(generate).toContain('loadAiConfig')
    expect(generate).toContain('generateSkillMatrixFromDescription')
  })

  it('does not expose the legacy generic bulk scoring action in PDS requirement navigation', () => {
    const actions = source('app/components/JobSubNavActions.vue')
    expect(actions).not.toContain('Score All Candidates')
    expect(actions).not.toContain('/analyze-all')
    expect(actions).not.toContain('bulk_scoring_started')
  })

  it('provides a lightweight health endpoint with database connectivity and process uptime', () => {
    const health = source('server/api/health.get.ts')
    expect(health).toContain('SELECT 1 as ok')
    expect(health).toContain('process.uptime()')
    expect(health).toContain('databaseLatencyMs')
    expect(health).toContain('setResponseStatus(event, 503)')
  })

  it('retries only transient database startup failures before failing migration startup', () => {
    const migrations = source('server/plugins/migrations.ts')
    expect(migrations).toContain('STARTUP_RETRY_DELAYS_MS = [2_000, 4_000]')
    expect(migrations).toContain('isTransientDatabaseError')
    expect(migrations).toContain("'ECONNREFUSED'")
    expect(migrations).toContain("'57P03'")
    expect(migrations).toContain('await wait(retryDelay)')
    expect(migrations).toContain('throw error')
  })
})
