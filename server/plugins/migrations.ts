import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { db } from '../utils/db'

const MIGRATION_LOCK_ID = 123456789
const STARTUP_RETRY_DELAYS_MS = [2_000, 4_000]

function isTransientDatabaseError(error: unknown) {
  const value = error as { code?: string; message?: string }
  const code = value?.code ?? ''
  const message = value?.message?.toLowerCase() ?? ''

  return [
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    '57P03', // cannot_connect_now / database is starting up
    '53300', // too_many_connections
    '08000',
    '08001',
    '08003',
    '08006',
  ].includes(code)
    || message.includes('connection refused')
    || message.includes('connection terminated')
    || message.includes('connection timeout')
    || message.includes('database system is starting up')
}

async function wait(ms: number) {
  await new Promise(resolve => setTimeout(resolve, ms))
}

async function runMigrationAttempt() {
  let locked = false
  try {
    const lockResult = await db.execute<{ locked: boolean }>(
      `SELECT pg_try_advisory_lock(${MIGRATION_LOCK_ID}) as locked`,
    )
    locked = lockResult[0]?.locked ?? false

    if (!locked) {
      console.log('[Reqcore] Another instance is running migrations, skipping')
      logInfo('migrations.skipped_locked')
      return
    }

    console.log('[Reqcore] Running database migrations...')
    await db.execute(`SET client_min_messages TO warning`)
    await migrate(db, {
      migrationsFolder: './server/database/migrations',
    })
    await db.execute(`SET client_min_messages TO notice`)
    console.log('[Reqcore] Database migrations applied successfully')
    logInfo('migrations.completed')
  }
  finally {
    if (locked) {
      await db.execute(
        `SELECT pg_advisory_unlock(${MIGRATION_LOCK_ID})`,
      ).catch(() => {})
    }
  }
}

export default defineNitroPlugin(async () => {
  // Skip during build-time prerendering — database isn't available.
  if (import.meta.prerender) return

  // Railway handles schema sync via preDeploy commands.
  // Running runtime migrations there can conflict with drizzle-kit push/migrate.
  if (process.env.RAILWAY_ENVIRONMENT_ID) {
    console.log('[Reqcore] Skipping runtime migrations on Railway (handled in preDeploy)')
    logInfo('migrations.skipped_railway')
    return
  }

  const maxAttempts = STARTUP_RETRY_DELAYS_MS.length + 1

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await runMigrationAttempt()
      return
    }
    catch (error) {
      const retryDelay = STARTUP_RETRY_DELAYS_MS[attempt - 1]
      if (retryDelay && isTransientDatabaseError(error)) {
        console.warn(`[Reqcore] Database not ready during startup migration attempt ${attempt}/${maxAttempts}; retrying in ${retryDelay}ms`)
        logInfo('migrations.retrying_transient_database_error', {
          attempt,
          retry_delay_ms: retryDelay,
        })
        await wait(retryDelay)
        continue
      }

      console.error('[Reqcore] Migration failed:', error)
      logError('migrations.failed', {
        attempt,
        error_message: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }
})
