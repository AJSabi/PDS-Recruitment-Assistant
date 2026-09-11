import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  assertProcessLocalRateLimitDeploymentSafe,
  isProductionLikeRateLimitEnvironment,
  parseRailwayReplicaCount,
} from '../../server/utils/rateLimitDeployment'

describe('process-local rate-limit deployment safety', () => {
  it('recognizes production-like runtime environments', () => {
    expect(isProductionLikeRateLimitEnvironment({ nodeEnv: 'production' })).toBe(true)
    expect(isProductionLikeRateLimitEnvironment({ railwayEnvironmentName: 'Production' })).toBe(true)
    expect(isProductionLikeRateLimitEnvironment({ railwayEnvironmentName: 'prod' })).toBe(true)
    expect(isProductionLikeRateLimitEnvironment({ nodeEnv: 'test', railwayEnvironmentName: 'staging' })).toBe(false)
  })

  it('parses only positive integer Railway replica counts', () => {
    expect(parseRailwayReplicaCount(undefined)).toBeNull()
    expect(parseRailwayReplicaCount('')).toBeNull()
    expect(parseRailwayReplicaCount('1')).toBe(1)
    expect(parseRailwayReplicaCount('2')).toBe(2)
    expect(parseRailwayReplicaCount('0')).toBeNull()
    expect(parseRailwayReplicaCount('-1')).toBeNull()
    expect(parseRailwayReplicaCount('1.5')).toBeNull()
    expect(parseRailwayReplicaCount('not-a-number')).toBeNull()
  })

  it('allows a single production replica', () => {
    expect(() => assertProcessLocalRateLimitDeploymentSafe({
      nodeEnv: 'production',
      railwayReplicaCount: '1',
    })).not.toThrow()
  })

  it('rejects explicit multi-replica production deployments', () => {
    expect(() => assertProcessLocalRateLimitDeploymentSafe({
      railwayEnvironmentName: 'production',
      railwayReplicaCount: '2',
    })).toThrow(/shared\/edge rate limiter/i)
  })

  it('does not block non-production multi-replica environments', () => {
    expect(() => assertProcessLocalRateLimitDeploymentSafe({
      nodeEnv: 'test',
      railwayEnvironmentName: 'staging',
      railwayReplicaCount: '4',
    })).not.toThrow()
  })

  it('enforces the deployment guard in release preflight and runtime limiter setup', () => {
    const preflight = readFileSync('server/scripts/release-preflight.ts', 'utf8')
    const limiter = readFileSync('server/utils/rateLimit.ts', 'utf8')
    expect(preflight).toContain('assertProcessLocalRateLimitDeploymentSafe')
    expect(preflight).toContain('RAILWAY_REPLICA_COUNT')
    expect(limiter).toContain('assertProcessLocalRateLimitDeploymentSafe')
    expect(limiter).not.toContain('effective limits are')
  })
})
