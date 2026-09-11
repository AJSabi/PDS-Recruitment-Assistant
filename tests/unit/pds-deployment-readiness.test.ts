import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function read(path: string) {
  return readFileSync(path, 'utf8')
}

describe('production deployment readiness guards', () => {
  it('keeps Railway service startup free of database migration side effects', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> }

    expect(pkg.scripts['start:railway']).toBe('node .output/server/index.mjs')
    expect(pkg.scripts['start:railway']).not.toContain('db:migrate')
    expect(pkg.scripts['deploy:migrate']).toContain('release:preflight')
    expect(pkg.scripts['deploy:migrate']).toContain('db:migrate')
  })

  it('exposes dependency-free liveness and database-backed readiness probes', () => {
    const live = read('server/api/_health/live.get.ts')
    const ready = read('server/api/_health/ready.get.ts')

    expect(live).toContain("check: 'liveness'")
    expect(live).not.toContain('db.')
    expect(ready).toContain("check: 'readiness'")
    expect(ready).toContain('db.execute')
    expect(ready).toContain('select 1')
    expect(ready).toContain('setResponseStatus(event, 503)')
  })

  it('documents the single-replica and one-time migration production constraints', () => {
    const runbook = read('DEPLOYMENT-RUNBOOK.md')

    expect(runbook).toContain('Run one application replica only')
    expect(runbook).toContain('npm run deploy:migrate')
    expect(runbook).toContain('/api/_health/ready')
    expect(runbook).toContain('Do not run migrations independently from every application replica')
  })
})
