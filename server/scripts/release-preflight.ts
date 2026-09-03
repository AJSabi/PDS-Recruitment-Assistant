import { envSchema } from '../utils/env'
import {
  assertProcessLocalRateLimitDeploymentSafe,
  isProductionLikeRateLimitEnvironment,
} from '../utils/rateLimitDeployment'

const PLACEHOLDER_VALUES = [
  'change-me',
  'replace-with-openssl-rand-base64-32-output',
  'validation-only-secret-not-used-at-runtime',
]

function fail(message: string): never {
  console.error(`[release-preflight] ${message}`)
  process.exit(1)
}

function isPlaceholder(value: string | undefined) {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return PLACEHOLDER_VALUES.some(placeholder => normalized.includes(placeholder))
}

const parsed = envSchema.safeParse(process.env)
if (!parsed.success) {
  const issues = parsed.error.issues
    .map(issue => `${issue.path.join('.')}: ${issue.message}`)
    .join('\n')
  fail(`Environment validation failed:\n${issues}`)
}

const env = parsed.data
const rateLimitDeploymentEnvironment = {
  nodeEnv: process.env.NODE_ENV,
  railwayEnvironmentName: process.env.RAILWAY_ENVIRONMENT_NAME,
  railwayReplicaCount: process.env.RAILWAY_REPLICA_COUNT,
}
const productionLike = isProductionLikeRateLimitEnvironment(rateLimitDeploymentEnvironment)

if (!productionLike) {
  console.log('[release-preflight] Base environment validation passed (non-production environment).')
  process.exit(0)
}

try {
  assertProcessLocalRateLimitDeploymentSafe(rateLimitDeploymentEnvironment)
} catch (error) {
  fail(error instanceof Error ? error.message : 'Process-local API rate-limit deployment safety check failed.')
}

if (isPlaceholder(env.BETTER_AUTH_SECRET)) {
  fail('BETTER_AUTH_SECRET contains a known placeholder value.')
}

if (isPlaceholder(env.S3_ACCESS_KEY) || isPlaceholder(env.S3_SECRET_KEY)) {
  fail('S3 credentials contain known placeholder values.')
}

const authUrl = env.BETTER_AUTH_URL
  ?? (env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : undefined)

if (!authUrl?.startsWith('https://')) {
  fail('Production BETTER_AUTH_URL (or derived Railway public domain) must use HTTPS.')
}

if (env.S3_ENDPOINT.startsWith('http://') && !env.S3_FORCE_PATH_STYLE) {
  fail('Managed production S3 endpoints must use HTTPS.')
}

if (!env.SMTP_HOST && !env.RESEND_API_KEY) {
  fail('Production requires an email provider. Configure SMTP_HOST or RESEND_API_KEY; console email fallback is not permitted.')
}

if (process.env.GDPR_CLEANUP_ENABLED === 'true' && !env.CRON_SECRET) {
  fail('CRON_SECRET is required when GDPR_CLEANUP_ENABLED=true.')
}

console.log('[release-preflight] Production environment validation passed.')
