import { sql } from 'drizzle-orm'

/**
 * Traffic-readiness probe. The process is ready only when it can reach the
 * primary database. Return 503 without exposing connection details.
 */
export default defineEventHandler(async (event) => {
  setHeader(event, 'cache-control', 'no-store')

  try {
    await db.execute(sql`select 1`)
    return {
      status: 'ok',
      service: 'pds-recruitment-assistant',
      check: 'readiness',
      database: 'ok',
    }
  } catch (error) {
    logError('health.readiness_failed', {
      error_message: error instanceof Error ? error.message : String(error),
    })
    setResponseStatus(event, 503)
    return {
      status: 'unavailable',
      service: 'pds-recruitment-assistant',
      check: 'readiness',
      database: 'unavailable',
    }
  }
})
