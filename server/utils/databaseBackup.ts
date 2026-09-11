import { execFile } from 'node:child_process'
import { mkdir, writeFile, unlink, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { buildPgDumpEnv } from './pgDumpEnv'

const execFileAsync = promisify(execFile)
export const DURABLE_BACKUP_DIR = '/data/backups'

export interface DatabaseBackupResult {
  filename: string
  path: string
  sizeBytes: number
}

/**
 * Create a durable PostgreSQL backup in the mounted backup volume.
 * This intentionally never falls back to /tmp: an ephemeral file must not be
 * reported as a recoverable production backup.
 */
export async function createDurableDatabaseBackup(databaseUrl: string): Promise<DatabaseBackupResult> {
  await mkdir(DURABLE_BACKUP_DIR, { recursive: true })

  // Verify that the mounted backup directory is actually writable.
  const probe = join(DURABLE_BACKUP_DIR, `.probe-${process.pid}-${Date.now()}`)
  await writeFile(probe, '')
  await unlink(probe)

  const dbUrl = new URL(databaseUrl)
  const host = dbUrl.hostname
  const port = dbUrl.port || '5432'
  const user = decodeURIComponent(dbUrl.username)
  const database = decodeURIComponent(dbUrl.pathname.slice(1))

  if (!host || !user || !database) {
    throw new Error('DATABASE_URL must contain host, user, and database name for backup')
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = `reqcore-backup-${timestamp}.sql`
  const backupPath = join(DURABLE_BACKUP_DIR, filename)

  try {
    await execFileAsync(
      'pg_dump',
      [
        '-h', host,
        '-p', port,
        '-U', user,
        '-d', database,
        '--no-owner',
        '--no-acl',
        '--format=plain',
        '--file', backupPath,
      ],
      {
        timeout: 300_000,
        env: buildPgDumpEnv(process.env, decodeURIComponent(dbUrl.password)),
      },
    )

    const file = await stat(backupPath)
    if (file.size <= 0) {
      throw new Error('pg_dump completed but produced an empty backup file')
    }

    return { filename, path: backupPath, sizeBytes: file.size }
  }
  catch (error) {
    await unlink(backupPath).catch(() => {})
    throw error
  }
}
