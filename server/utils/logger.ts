import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
import { logs, SeverityNumber } from '@opentelemetry/api-logs'
import type { AnyValueMap } from '@opentelemetry/api-logs'
import { resourceFromAttributes } from '@opentelemetry/resources'
import type { H3Event } from 'h3'
import { version as APP_VERSION } from '../../package.json'

let loggerProvider: LoggerProvider | null = null

/**
 * Initialize the OpenTelemetry LoggerProvider that sends structured logs
 * to PostHog via OTLP HTTP.
 *
 * Call once during server startup (Nitro plugin). Subsequent calls are no-ops.
 */
export function initLoggerProvider(): void {
  if (loggerProvider) return

  const token = process.env.POSTHOG_PUBLIC_KEY
  if (!token) return

  const host = process.env.POSTHOG_HOST || 'https://eu.i.posthog.com'

  loggerProvider = new LoggerProvider({
    resource: resourceFromAttributes({
      'service.name': 'reqcore',
      'service.version': APP_VERSION,
      'deployment.environment': process.env.RAILWAY_ENVIRONMENT_NAME || 'development',
    }),
    processors: [
      new BatchLogRecordProcessor(
        new OTLPLogExporter({
          url: `${host}/i/v1/logs`,
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }),
      ),
    ],
  })

  logs.setGlobalLoggerProvider(loggerProvider)
}

/**
 * Flush pending logs and shut down the provider.
 * Call during server shutdown so buffered logs aren't lost.
 */
export async function shutdownLoggerProvider(): Promise<void> {
  if (!loggerProvider) return
  await loggerProvider.forceFlush()
  await loggerProvider.shutdown()
  loggerProvider = null
}

// ─────────────────────────────────────────────
// Convenience logger — wraps the OTel API
// ─────────────────────────────────────────────

function getLogger() {
  return logs.getLogger('reqcore')
}

interface LogContext {
  posthog_distinct_id?: string
  org_id?: string
  [key: string]: unknown
}

const SENSITIVE_ATTRIBUTE_KEY = /(email|phone|password|secret|token|authorization|cookie|request[_-]?body|response[_-]?body|content|prompt|resume|\bcv\b|api[_-]?key)/i
const MAX_LOG_STRING_LENGTH = 500

/**
 * Redact common credentials and direct identifiers from a diagnostic string.
 * This is a last line of defence for upstream error messages; callers should
 * still avoid intentionally placing candidate/resume payloads in telemetry.
 */
export function sanitizeLogString(value: string): string {
  const redacted = value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
    .replace(/\b(?:\+?\d[\d\s().-]{7,}\d)\b/g, '[REDACTED_PHONE]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_JWT]')
    .replace(/([?&](?:token|secret|password|key|code)=)[^&#\s]+/gi, '$1[REDACTED]')
    .replace(/(https?:\/\/)([^\s/@:]+):([^\s/@]+)@/gi, '$1[REDACTED]:[REDACTED]@')

  return redacted.length > MAX_LOG_STRING_LENGTH
    ? `${redacted.slice(0, MAX_LOG_STRING_LENGTH)}…[TRUNCATED]`
    : redacted
}

/**
 * Keep telemetry attributes scalar and redact values whose keys indicate PII,
 * credentials, candidate content, or model payloads. Nested objects/arrays are
 * intentionally not serialized into production logs.
 */
export function sanitizeLogAttributes(attributes?: Record<string, unknown>): AnyValueMap | undefined {
  if (!attributes) return undefined

  const sanitized: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || value === null) continue

    if (SENSITIVE_ATTRIBUTE_KEY.test(key)) {
      sanitized[key] = '[REDACTED]'
      continue
    }

    if (typeof value === 'string') {
      sanitized[key] = sanitizeLogString(value)
    }
    else if (typeof value === 'number' || typeof value === 'boolean') {
      sanitized[key] = value
    }
    else {
      sanitized[key] = '[NON_SCALAR_OMITTED]'
    }
  }
  return sanitized as AnyValueMap
}

function emitLog(severityNumber: SeverityNumber, severityText: string, body: string, attributes?: LogContext): void {
  try {
    getLogger().emit({
      severityNumber,
      severityText,
      body: sanitizeLogString(body),
      attributes: sanitizeLogAttributes(attributes),
    })
  }
  catch {
    // Logging must never break the primary operation
  }
}

/** Emit an INFO-level structured log to PostHog. */
export function logInfo(body: string, attributes?: LogContext): void {
  emitLog(SeverityNumber.INFO, 'INFO', body, attributes)
}

/** Emit a WARN-level structured log to PostHog. */
export function logWarn(body: string, attributes?: LogContext): void {
  emitLog(SeverityNumber.WARN, 'WARN', body, attributes)
}

/** Emit an ERROR-level structured log to PostHog. */
export function logError(body: string, attributes?: LogContext): void {
  emitLog(SeverityNumber.ERROR, 'ERROR', body, attributes)
}

/**
 * Emit a DEBUG-level structured log to PostHog.
 * Use for detailed diagnostics during active investigation. Off in production
 * by default — enable selectively for specific services.
 */
export function logDebug(body: string, attributes?: LogContext): void {
  emitLog(SeverityNumber.DEBUG, 'DEBUG', body, attributes)
}

/**
 * Extract common request attributes from an H3 event for wide-event logging.
 * Includes PostHog session_id for Session Replay linking when available.
 */
export function requestAttributes(event: H3Event): Record<string, string | undefined> {
  const headers = getHeaders(event)
  // Extract PostHog session_id from the cookie for Session Replay linking.
  // The ph_<project>_posthog cookie stores a JSON blob; $sesid contains the
  // active session ID. We also extract the distinct_id for identity linking.
  let sessionId: string | undefined
  let cookieDistinctId: string | undefined
  try {
    const phCookie = getCookie(event, 'ph_reqcore_posthog')
    if (phCookie) {
      const parsed = JSON.parse(phCookie)
      sessionId = parsed?.$sesid?.[1]
      cookieDistinctId = parsed?.distinct_id
    }
  }
  catch {
    // Cookie may be missing or malformed — non-critical
  }
  return {
    http_method: getMethod(event),
    http_path: getRequestURL(event).pathname,
    user_agent: headers['user-agent'],
    ...(sessionId ? { '$session_id': sessionId } : {}),
    ...(cookieDistinctId ? { posthog_distinct_id: cookieDistinctId } : {}),
  }
}

interface SessionInfo {
  user: { id: string }
  session: { activeOrganizationId: string }
}

/**
 * Build a wide-event log for a completed API request.
 * Follows PostHog best practices: one structured log per request with full context.
 */
export function logApiRequest(
  event: H3Event,
  session: SessionInfo | null,
  body: string,
  extra?: Record<string, unknown>,
): void {
  logInfo(body, {
    ...requestAttributes(event),
    posthog_distinct_id: session?.user?.id,
    org_id: session?.session?.activeOrganizationId,
    ...extra,
  })
}

/**
 * Log an API error as a wide event with full request context.
 */
export function logApiError(
  event: H3Event,
  session: SessionInfo | null,
  body: string,
  extra?: Record<string, unknown>,
): void {
  logError(body, {
    ...requestAttributes(event),
    posthog_distinct_id: session?.user?.id,
    org_id: session?.session?.activeOrganizationId,
    ...extra,
  })
}
