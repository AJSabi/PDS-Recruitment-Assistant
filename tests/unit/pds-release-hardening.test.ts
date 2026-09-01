import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const railway = readFileSync('railway.json', 'utf8')
const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
  scripts?: Record<string, string>
}
const workflow = readFileSync('.github/workflows/pds-validation.yml', 'utf8')
const preflight = readFileSync('server/scripts/release-preflight.ts', 'utf8')

describe('PDS production release hardening', () => {
  it('runs preflight and migrations without automatic demo seeding', () => {
    expect(railway).toContain('npm run release:preflight && npm run db:migrate')
    expect(railway).not.toContain('db:seed')
    expect(railway).not.toContain('db:reseed')
  })

  it('keeps seeding explicit rather than part of application start', () => {
    expect(packageJson.scripts?.['db:seed']).toBeDefined()
    expect(packageJson.scripts?.['db:reseed']).toBeDefined()
    expect(packageJson.scripts?.start).not.toContain('db:seed')
    expect(packageJson.scripts?.['start:railway']).not.toContain('db:seed')
  })

  it('runs production release preflight in CI', () => {
    expect(workflow).toContain('Production release preflight')
    expect(workflow).toContain('npm run release:preflight')
    expect(workflow).toContain('NODE_ENV: production')
  })

  it('rejects insecure or placeholder production configuration', () => {
    expect(preflight).toContain('BETTER_AUTH_SECRET contains a known placeholder value')
    expect(preflight).toContain('must use HTTPS')
    expect(preflight).toContain("GDPR_CLEANUP_ENABLED === 'true'")
    expect(preflight).toContain('CRON_SECRET is required when GDPR_CLEANUP_ENABLED=true')
  })
})
