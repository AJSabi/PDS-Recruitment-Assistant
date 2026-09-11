import { and, eq, ne, or, sql } from 'drizzle-orm'
import { candidate } from '../database/schema'

export type CandidateIdentityMatchBasis = 'email' | 'phone'

export type CandidateIdentityMatch = {
  basis: CandidateIdentityMatchBasis
  candidate: {
    id: string
    firstName: string
    lastName: string
    email: string
    phone: string | null
    quarantinedAt: Date | null
  }
}

export function normalizeCandidateEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? ''
}

export function normalizeCandidatePhone(value: string | null | undefined) {
  const digits = value?.replace(/\D/g, '') ?? ''
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2)
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1)
  return digits
}

function phoneMatchCondition(phone: string) {
  const normalized = normalizeCandidatePhone(phone)
  if (!normalized) return undefined

  const storedDigits = sql<string>`regexp_replace(coalesce(${candidate.phone}, ''), '[^0-9]', '', 'g')`
  if (normalized.length === 10) {
    return or(
      sql`${storedDigits} = ${normalized}`,
      sql`${storedDigits} = ${`91${normalized}`}`,
      sql`${storedDigits} = ${`0${normalized}`}`,
    )
  }
  return sql`${storedDigits} = ${normalized}`
}

export async function findCandidateIdentityMatch(
  organizationId: string,
  identity: { email?: string | null; phone?: string | null },
  options: { excludeCandidateId?: string } = {},
): Promise<CandidateIdentityMatch | null> {
  const baseConditions = [eq(candidate.organizationId, organizationId)]
  if (options.excludeCandidateId) baseConditions.push(ne(candidate.id, options.excludeCandidateId))

  const email = normalizeCandidateEmail(identity.email)
  if (email) {
    const emailMatch = await db.query.candidate.findFirst({
      where: and(
        ...baseConditions,
        sql`lower(trim(${candidate.email})) = ${email}`,
      ),
      columns: { id: true, firstName: true, lastName: true, email: true, phone: true, quarantinedAt: true },
    })
    if (emailMatch) return { basis: 'email', candidate: emailMatch }
  }

  const phoneCondition = identity.phone ? phoneMatchCondition(identity.phone) : undefined
  if (phoneCondition) {
    const phoneMatch = await db.query.candidate.findFirst({
      where: and(...baseConditions, phoneCondition),
      columns: { id: true, firstName: true, lastName: true, email: true, phone: true, quarantinedAt: true },
    })
    if (phoneMatch) return { basis: 'phone', candidate: phoneMatch }
  }

  return null
}
