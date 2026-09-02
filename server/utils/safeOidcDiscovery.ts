import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { auth } from './auth'

const MAX_REDIRECTS = 3
const OIDC_ENDPOINT_KEYS = [
  'authorization_endpoint',
  'token_endpoint',
  'userinfo_endpoint',
  'revocation_endpoint',
  'introspection_endpoint',
  'end_session_endpoint',
  'jwks_uri',
] as const

function stripIpv6Brackets(hostname: string) {
  return hostname.replace(/^\[/, '').replace(/\]$/, '').toLowerCase()
}

function isBlockedIpv4(address: string) {
  const octets = address.split('.').map(Number)
  if (octets.length !== 4 || octets.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return true
  const [a, b] = octets
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 100 && b! >= 64 && b! <= 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b! >= 16 && b! <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 198 && (b === 18 || b === 19)) return true
  if (a! >= 224) return true
  return false
}

function isBlockedIpv6(address: string) {
  const normalized = stripIpv6Brackets(address)
  if (normalized === '::' || normalized === '::1') return true
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true
  if (/^fe[89ab]/.test(normalized)) return true
  if (normalized.startsWith('ff')) return true

  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped?.[1]) return isBlockedIpv4(mapped[1])
  return false
}

function isBlockedIp(address: string) {
  const version = isIP(stripIpv6Brackets(address))
  if (version === 4) return isBlockedIpv4(address)
  if (version === 6) return isBlockedIpv6(address)
  return true
}

/**
 * Validate the actual network destinations for an outbound OIDC URL.
 * Hostname allow/deny checks alone are insufficient because an attacker-owned
 * hostname can resolve to loopback, RFC1918, link-local or cloud metadata IPs.
 */
export async function assertSafeOidcUrl(urlString: string): Promise<URL> {
  let url: URL
  try {
    url = new URL(urlString)
  } catch {
    throw createError({ statusCode: 422, statusMessage: 'Identity-provider URL is invalid.' })
  }

  if (url.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
    throw createError({ statusCode: 422, statusMessage: 'Identity-provider URLs must use HTTPS in production.' })
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw createError({ statusCode: 422, statusMessage: 'Identity-provider URL must use HTTP or HTTPS.' })
  }
  if (url.username || url.password) {
    throw createError({ statusCode: 422, statusMessage: 'Identity-provider URLs must not contain credentials.' })
  }

  const hostname = stripIpv6Brackets(url.hostname)
  if (!hostname) throw createError({ statusCode: 422, statusMessage: 'Identity-provider URL has no hostname.' })

  if (isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      throw createError({ statusCode: 422, statusMessage: 'Identity-provider URL must not target a private or local network address.' })
    }
    return url
  }

  let addresses: Array<{ address: string }>
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true })
  } catch {
    throw createError({ statusCode: 422, statusMessage: 'Identity-provider hostname could not be resolved.' })
  }
  if (addresses.length === 0 || addresses.some(result => isBlockedIp(result.address))) {
    throw createError({ statusCode: 422, statusMessage: 'Identity-provider hostname resolves to a private or local network address.' })
  }

  return url
}

async function fetchDiscoveryDocument(discoveryUrl: string): Promise<Record<string, unknown>> {
  let current = discoveryUrl
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    const validated = await assertSafeOidcUrl(current)
    const response = await fetch(validated, {
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
      headers: { accept: 'application/json' },
    })

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location || redirectCount === MAX_REDIRECTS) {
        throw createError({ statusCode: 422, statusMessage: 'OIDC discovery redirected too many times.' })
      }
      current = new URL(location, validated).toString()
      continue
    }

    if (!response.ok) {
      throw createError({ statusCode: 422, statusMessage: 'Could not load the OIDC discovery document.' })
    }

    const payload = await response.json()
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw createError({ statusCode: 422, statusMessage: 'OIDC discovery returned an invalid document.' })
    }
    return payload as Record<string, unknown>
  }
  throw createError({ statusCode: 422, statusMessage: 'OIDC discovery could not be completed.' })
}

/**
 * Safely discover an OIDC provider and inject only validated public endpoint
 * origins into Better Auth's live trusted-origin list.
 */
export async function prefetchSafeOidcEndpointOrigins(issuerUrl: string): Promise<void> {
  const issuer = await assertSafeOidcUrl(issuerUrl)
  const discoveryUrl = `${issuer.toString().replace(/\/+$/, '')}/.well-known/openid-configuration`
  const discovery = await fetchDiscoveryDocument(discoveryUrl)

  const newOrigins = new Set<string>([issuer.origin])
  for (const key of OIDC_ENDPOINT_KEYS) {
    const value = discovery[key]
    if (typeof value !== 'string') continue
    const validatedEndpoint = await assertSafeOidcUrl(value)
    newOrigins.add(validatedEndpoint.origin)
  }

  const ctx = await (auth as any).$context
  const existing = new Set(ctx.trustedOrigins as string[])
  for (const origin of newOrigins) {
    if (!existing.has(origin)) (ctx.trustedOrigins as string[]).push(origin)
  }
}
