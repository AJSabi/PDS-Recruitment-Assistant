export interface RateLimitDeploymentEnvironment {
  nodeEnv?: string
  railwayEnvironmentName?: string
  railwayReplicaCount?: string
}

export function isProductionLikeRateLimitEnvironment(env: RateLimitDeploymentEnvironment) {
  const railwayEnvironment = env.railwayEnvironmentName?.trim().toLowerCase()
  return env.nodeEnv === 'production'
    || railwayEnvironment === 'production'
    || railwayEnvironment === 'prod'
}

export function parseRailwayReplicaCount(value: string | undefined): number | null {
  if (!value?.trim()) return null
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) return null
  return parsed
}

/**
 * The public-application and chatbot limiters are intentionally process-local.
 * Until a shared/edge limiter is configured, production horizontal scaling must
 * be rejected rather than silently multiplying the effective request allowance.
 */
export function assertProcessLocalRateLimitDeploymentSafe(env: RateLimitDeploymentEnvironment) {
  if (!isProductionLikeRateLimitEnvironment(env)) return

  const replicaCount = parseRailwayReplicaCount(env.railwayReplicaCount)
  if (replicaCount && replicaCount > 1) {
    throw new Error(
      `Process-local API rate limiting is unsafe with ${replicaCount} replicas. `
      + 'Keep this deployment at one replica or configure a shared/edge rate limiter before scaling horizontally.',
    )
  }
}
