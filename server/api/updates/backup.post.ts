import { createDurableDatabaseBackup } from '../../utils/databaseBackup'

interface BackupResult {
  success: boolean
  message: string
  filename?: string
  sizeBytes?: number
}

/**
 * POST /api/updates/backup
 *
 * Creates a PostgreSQL backup in the durable /data/backups volume.
 * Ephemeral /tmp fallback is deliberately not allowed because an update
 * backup must remain available for recovery after a container restart.
 *
 * Requires authentication (owner only).
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, { organization: ['delete'] })

  try {
    const backup = await createDurableDatabaseBackup(env.DATABASE_URL)
    return {
      success: true,
      message: `Durable database backup created successfully at ${backup.path}`,
      filename: backup.filename,
      sizeBytes: backup.sizeBytes,
    } satisfies BackupResult
  }
  catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return {
      success: false,
      message: `Backup failed: ${message}. Update/release operations should not proceed until a durable database backup is available.`,
    } satisfies BackupResult
  }
})
