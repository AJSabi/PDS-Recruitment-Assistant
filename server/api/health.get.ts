export default defineEventHandler(async (event) => {
  const started = performance.now()
  let database: 'ok' | 'error' = 'ok'
  let databaseLatencyMs: number | null = null

  try {
    const dbStarted = performance.now()
    await db.execute(`SELECT 1 as ok`)
    databaseLatencyMs = Math.round(performance.now() - dbStarted)
  }
  catch {
    database = 'error'
    setResponseStatus(event, 503)
  }

  return {
    status: database === 'ok' ? 'ok' : 'degraded',
    database,
    databaseLatencyMs,
    uptimeSeconds: Math.floor(process.uptime()),
    responseTimeMs: Math.round(performance.now() - started),
    timestamp: new Date().toISOString(),
  }
})
