import { z } from 'zod'
import { eq, and, ne } from 'drizzle-orm'
import { ssoProvider } from '~~/server/database/schema'
import { prefetchOidcEndpointOrigins } from '~~/server/utils/auth'
import { assertRecruitmentAdmin } from '~~/server/utils/recruitmentVisibility'

const BLOCKED_ISSUER_HOSTNAMES = new Set(['localhost', '169.254.169.254', 'metadata.google.internal', 'metadata.internal', 'instance-data'])

function isBlockedIssuerUrl(url: string): boolean {
  let hostname: string
  try { hostname = new URL(url).hostname.toLowerCase() } catch { return true }
  if (BLOCKED_ISSUER_HOSTNAMES.has(hostname)) return true
  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])]
    if (a === 127 || a === 0 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)) return true
  }
  if (hostname === '::1' || hostname.startsWith('fe80:')) return true
  return false
}

const registerSsoSchema = z.object({
  providerId: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/, 'Only lowercase alphanumeric and hyphens'),
  issuer: z.string().url()
    .refine(url => url.startsWith('https://') || url.startsWith('http://'), 'Issuer URL must use HTTPS (or HTTP for local development)')
    .refine(url => !isBlockedIssuerUrl(url), 'Issuer URL must not target internal or private network addresses'),
  domain: z.string().min(1).max(253).regex(/^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/, 'Must be a valid domain (e.g. company.com)'),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
})

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { organization: ['update'] })
  const orgId = session.session.activeOrganizationId
  await assertRecruitmentAdmin(orgId, session.user.id)
  const body = await readValidatedBody(event, registerSsoSchema.parse)

  const existingDomain = await db.select({ id: ssoProvider.id }).from(ssoProvider)
    .where(and(eq(ssoProvider.domain, body.domain), ne(ssoProvider.organizationId, orgId))).limit(1)
  if (existingDomain.length) throw createError({ statusCode: 409, statusMessage: 'This email domain is already registered by another organization.' })

  const existingProvider = await db.select({ id: ssoProvider.id }).from(ssoProvider).where(eq(ssoProvider.providerId, body.providerId)).limit(1)
  if (existingProvider.length) throw createError({ statusCode: 409, statusMessage: 'A provider with this ID already exists. Choose a different provider ID.' })

  try {
    await prefetchOidcEndpointOrigins(body.issuer)
    const result = await (auth.api as any).registerSSOProvider({
      headers: event.headers,
      body: {
        providerId: body.providerId,
        issuer: body.issuer,
        domain: body.domain,
        organizationId: orgId,
        oidcConfig: { clientId: body.clientId, clientSecret: body.clientSecret, scopes: ['openid', 'email', 'profile'], pkce: true },
      },
    })
    setResponseStatus(event, 201)
    return { id: result.id, providerId: result.providerId, issuer: result.issuer, domain: result.domain }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to register SSO provider'
    if (message.includes('discovery_not_found')) throw createError({ statusCode: 422, statusMessage: 'Could not reach the OIDC discovery endpoint. Verify the issuer URL is correct.' })
    if (message.includes('discovery_timeout')) throw createError({ statusCode: 422, statusMessage: 'The identity provider did not respond in time. Please try again.' })
    if (message.includes('issuer_mismatch')) throw createError({ statusCode: 422, statusMessage: 'The issuer in the discovery document does not match the provided issuer URL.' })
    throw createError({ statusCode: 400, statusMessage: message })
  }
})
