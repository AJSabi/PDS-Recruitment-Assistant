import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createDurableDatabaseBackup } from '../../utils/databaseBackup'

const execFileAsync = promisify(execFile)

interface UpdateResult {
  success: boolean
  message: string
  previousVersion: string | null
  steps: { step: string; status: 'success' | 'failed'; detail?: string }[]
}

/**
 * POST /api/updates/apply
 *
 * Triggers a self-hosted update via Docker Compose.
 * A durable PostgreSQL backup is mandatory before any code pull/rebuild.
 *
 * Requires authentication (owner only).
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, { organization: ['delete'] })

  const steps: UpdateResult['steps'] = []

  const { readFile } = await import('node:fs/promises')
  const { resolve } = await import('node:path')
  let previousVersion: string | null = null
  try {
    const pkg = await readFile(resolve(process.cwd(), 'package.json'), 'utf-8')
    previousVersion = JSON.parse(pkg).version
  }
  catch {
    previousVersion = null
  }

  try {
    const { access } = await import('node:fs/promises')
    await access('/.dockerenv')
  }
  catch {
    return {
      success: false,
      message: 'Updates via UI are only available for Docker-based deployments. For other deployment methods, please update manually.',
      previousVersion,
      steps: [],
    } satisfies UpdateResult
  }

  for (const cmd of ['git', 'docker', 'pg_dump'] as const) {
    try {
      await execFileAsync('which', [cmd], { timeout: 5_000 })
    }
    catch {
      return {
        success: false,
        message: `The "${cmd}" command is not available inside this container. One-click updates require git, docker CLI, and pg_dump. Please update manually instead.`,
        previousVersion,
        steps: [],
      } satisfies UpdateResult
    }
  }

  // Safety gate: never change application code until a durable backup exists.
  try {
    const backup = await createDurableDatabaseBackup(env.DATABASE_URL)
    steps.push({
      step: 'Create durable database backup',
      status: 'success',
      detail: `${backup.path} (${backup.sizeBytes} bytes)`,
    })
  }
  catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    steps.push({ step: 'Create durable database backup', status: 'failed', detail: message })
    return {
      success: false,
      message: 'Update aborted because a durable database backup could not be created. No code was pulled and no containers were rebuilt.',
      previousVersion,
      steps,
    } satisfies UpdateResult
  }

  try {
    const { stdout } = await execFileAsync('git', ['pull', 'origin', 'main'], {
      cwd: '/app',
      timeout: 120_000,
    })
    steps.push({
      step: 'Pull latest code',
      status: 'success',
      detail: stdout.trim(),
    })
  }
  catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    steps.push({ step: 'Pull latest code', status: 'failed', detail: message })
    return {
      success: false,
      message: 'Failed to pull latest code. The pre-update database backup remains available.',
      previousVersion,
      steps,
    } satisfies UpdateResult
  }

  try {
    const { stdout } = await execFileAsync(
      'docker', ['compose', 'up', '--build', '--detach', '--no-deps', 'app'],
      {
        cwd: '/app',
        timeout: 600_000,
      },
    )
    steps.push({
      step: 'Rebuild & restart',
      status: 'success',
      detail: stdout.trim(),
    })
  }
  catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    steps.push({ step: 'Rebuild & restart', status: 'failed', detail: message })
    return {
      success: false,
      message: 'Failed to rebuild. A pre-update database backup is available for recovery; restore must be an explicit operator action.',
      previousVersion,
      steps,
    } satisfies UpdateResult
  }

  return {
    success: true,
    message: 'Update started successfully after creating a durable database backup. The application will restart momentarily.',
    previousVersion,
    steps,
  } satisfies UpdateResult
})
