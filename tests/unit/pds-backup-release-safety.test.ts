import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const backupRoute = readFileSync('server/api/updates/backup.post.ts', 'utf8')
const updateRoute = readFileSync('server/api/updates/apply.post.ts', 'utf8')
const backupUtil = readFileSync('server/utils/databaseBackup.ts', 'utf8')
const compose = readFileSync('docker-compose.yml', 'utf8')

describe('PDS backup and update recovery safety', () => {
  it('never represents an ephemeral /tmp file as a durable backup', () => {
    expect(backupUtil).toContain("DURABLE_BACKUP_DIR = '/data/backups'")
    expect(backupUtil).not.toContain("'/tmp'")
    expect(backupRoute).toContain('createDurableDatabaseBackup')
  })

  it('requires a non-empty pg_dump output', () => {
    expect(backupUtil).toContain('file.size <= 0')
    expect(backupUtil).toContain('produced an empty backup file')
  })

  it('persists the backup directory through docker compose', () => {
    expect(compose).toContain('backups_data:/data/backups')
    expect(compose).toContain('backups_data:')
  })

  it('creates a durable backup before pulling code or rebuilding containers', () => {
    const backupIndex = updateRoute.indexOf('createDurableDatabaseBackup')
    const pullIndex = updateRoute.indexOf("execFileAsync('git', ['pull'")
    const rebuildIndex = updateRoute.indexOf("'docker', ['compose', 'up'")

    expect(backupIndex).toBeGreaterThan(-1)
    expect(pullIndex).toBeGreaterThan(backupIndex)
    expect(rebuildIndex).toBeGreaterThan(pullIndex)
  })

  it('aborts the update if the pre-update backup fails', () => {
    expect(updateRoute).toContain('Update aborted because a durable database backup could not be created')
    expect(updateRoute).toContain('No code was pulled and no containers were rebuilt')
  })

  it('keeps restore an explicit operator action', () => {
    expect(updateRoute).toContain('restore must be an explicit operator action')
    expect(updateRoute).not.toContain('pg_restore')
    expect(updateRoute).not.toContain("execFileAsync('psql'")
  })
})
