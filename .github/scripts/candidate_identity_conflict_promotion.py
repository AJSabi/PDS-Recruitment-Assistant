from pathlib import Path


def replace(path: str, old: str, new: str, count: int = 1) -> None:
    p = Path(path)
    s = p.read_text()
    actual = s.count(old)
    if actual != count:
        raise SystemExit(f'{path}: expected {count}, found {actual} for {old[:140]!r}')
    p.write_text(s.replace(old, new, count))


Path('server/utils/candidateIdentityConflict.ts').write_text("""export type CandidateIdentityShape = {
  id?: string
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  phone?: string | null
}

export type CandidateIdentityConflict = {
  field: 'name' | 'email' | 'phone'
  existing: string
  incoming: string
}

function normalizeText(value: string | null | undefined) {
  return (value ?? '').trim().replace(/\\s+/g, ' ').toLocaleLowerCase()
}

function normalizePhone(value: string | null | undefined) {
  return (value ?? '').replace(/\\D/g, '')
}

function fullName(candidate: CandidateIdentityShape) {
  return [candidate.firstName, candidate.lastName].map(v => (v ?? '').trim()).filter(Boolean).join(' ')
}

export function findCandidateIdentityConflicts(
  existing: CandidateIdentityShape,
  incoming: CandidateIdentityShape,
): CandidateIdentityConflict[] {
  const conflicts: CandidateIdentityConflict[] = []
  const existingName = fullName(existing)
  const incomingName = fullName(incoming)

  if (existingName && incomingName && normalizeText(existingName) !== normalizeText(incomingName)) {
    conflicts.push({ field: 'name', existing: existingName, incoming: incomingName })
  }

  const existingEmail = normalizeText(existing.email)
  const incomingEmail = normalizeText(incoming.email)
  if (existingEmail && incomingEmail && existingEmail !== incomingEmail) {
    conflicts.push({ field: 'email', existing: existing.email!.trim(), incoming: incoming.email!.trim() })
  }

  const existingPhone = normalizePhone(existing.phone)
  const incomingPhone = normalizePhone(incoming.phone)
  if (existingPhone && incomingPhone && existingPhone !== incomingPhone) {
    conflicts.push({ field: 'phone', existing: existing.phone!.trim(), incoming: incoming.phone!.trim() })
  }

  return conflicts
}
""")

Path('server/api/jobs/[id]/candidate-identity-check.post.ts').write_text("""import { and, eq } from 'drizzle-orm'
import { candidate } from '../../../database/schema'
import { findCandidateIdentityConflicts } from '../../../utils/candidateIdentityConflict'
import { assertRequirementAccess } from '../../../utils/recruitmentVisibility'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })
const bodySchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().max(100).optional(),
  email: z.string().trim().email().max(255).transform(value => value.toLowerCase()),
  phone: z.string().trim().max(50).optional(),
})

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { candidate: ['create'] })
  const orgId = session.session.activeOrganizationId
  const { id: jobId } = await getValidatedRouterParams(event, paramsSchema.parse)
  await assertRequirementAccess(orgId, session.user.id, jobId)
  const body = await readValidatedBody(event, bodySchema.parse)

  const matchedByEmail = await db.query.candidate.findFirst({
    where: and(eq(candidate.organizationId, orgId), eq(candidate.email, body.email)),
    columns: { id: true, firstName: true, lastName: true, email: true, phone: true, quarantinedAt: true },
  })
  const matchedByPhone = !matchedByEmail && body.phone
    ? await db.query.candidate.findFirst({
        where: and(eq(candidate.organizationId, orgId), eq(candidate.phone, body.phone)),
        columns: { id: true, firstName: true, lastName: true, email: true, phone: true, quarantinedAt: true },
      })
    : undefined
  const matchedCandidate = matchedByEmail ?? matchedByPhone

  if (!matchedCandidate) return { matched: false as const }
  if (matchedCandidate.quarantinedAt) {
    throw createError({ statusCode: 409, statusMessage: 'A matching candidate is in retention quarantine and cannot be linked through recruiter intake.' })
  }

  const conflicts = findCandidateIdentityConflicts(matchedCandidate, body)
  return {
    matched: true as const,
    matchBasis: matchedByEmail ? 'email' as const : 'phone' as const,
    requiresConfirmation: conflicts.length > 0,
    conflicts,
    candidate: {
      id: matchedCandidate.id,
      firstName: matchedCandidate.firstName,
      lastName: matchedCandidate.lastName,
      email: matchedCandidate.email,
      phone: matchedCandidate.phone,
    },
  }
})
""")

# Enforce the same guard at intake so a caller cannot bypass the recruiter preflight.
replace(
    'server/api/jobs/[id]/candidate-intake.post.ts',
    "import { candidateIntakeSchema } from '../../../utils/schemas/candidateIntake'\n",
    "import { candidateIntakeSchema } from '../../../utils/schemas/candidateIntake'\nimport { findCandidateIdentityConflicts } from '../../../utils/candidateIdentityConflict'\n",
)
replace(
    'server/api/jobs/[id]/candidate-intake.post.ts',
    "    if (matchedCandidate) {\n      candidateRecord = { id: matchedCandidate.id, firstName: matchedCandidate.firstName, lastName: matchedCandidate.lastName, email: matchedCandidate.email }\n    } else {",
    "    if (matchedCandidate) {\n      const identityConflicts = findCandidateIdentityConflicts(matchedCandidate, body)\n      if (identityConflicts.length) {\n        throw createError({\n          statusCode: 409,\n          statusMessage: 'A Candidate Database record matches this email or phone, but its identity details differ. Review the conflict and explicitly use the existing candidate record instead of creating a new identity.',\n        })\n      }\n      candidateRecord = { id: matchedCandidate.id, firstName: matchedCandidate.firstName, lastName: matchedCandidate.lastName, email: matchedCandidate.email }\n    } else {",
)

# Recruiter UI: preflight identity against the central database and require explicit confirmation on conflicts.
replace(
    'app/components/ApplyCandidateModal.vue',
    "type ParsedResumeIdentity = {\n  firstName: string\n  lastName: string\n  email: string | null\n  phone: string | null\n  nameConfidence: 'high' | 'medium' | 'low'\n  nameSource: 'label' | 'header' | 'filename' | 'unresolved'\n}\n",
    "type ParsedResumeIdentity = {\n  firstName: string\n  lastName: string\n  email: string | null\n  phone: string | null\n  nameConfidence: 'high' | 'medium' | 'low'\n  nameSource: 'label' | 'header' | 'filename' | 'unresolved'\n}\ntype CandidateIdentityConflictCheck = {\n  matched: boolean\n  matchBasis?: 'email' | 'phone'\n  requiresConfirmation?: boolean\n  conflicts?: Array<{ field: 'name' | 'email' | 'phone'; existing: string; incoming: string }>\n  candidate?: { id: string; firstName: string; lastName: string; email: string; phone: string | null }\n}\n",
)
replace(
    'app/components/ApplyCandidateModal.vue',
    "const identityReviewed = ref(false)\nconst applyingParsedIdentity = ref(false)\n",
    "const identityReviewed = ref(false)\nconst applyingParsedIdentity = ref(false)\nconst identityConflictCheck = ref<CandidateIdentityConflictCheck | null>(null)\nconst identityConflictConfirmed = ref(false)\n",
)
replace(
    'app/components/ApplyCandidateModal.vue',
    "  resumeIdentity.value = null\n  identityReviewed.value = false\n  source.value = value === 'existing' ? 'existing_database' : 'recruiter_sourcing'\n",
    "  resumeIdentity.value = null\n  identityReviewed.value = false\n  identityConflictCheck.value = null\n  identityConflictConfirmed.value = false\n  source.value = value === 'existing' ? 'existing_database' : 'recruiter_sourcing'\n",
)
replace(
    'app/components/ApplyCandidateModal.vue',
    "  () => {\n    if (resumeFile.value && resumeIdentity.value && !applyingParsedIdentity.value) identityReviewed.value = false\n  },\n)",
    "  () => {\n    if (resumeFile.value && resumeIdentity.value && !applyingParsedIdentity.value) identityReviewed.value = false\n    identityConflictCheck.value = null\n    identityConflictConfirmed.value = false\n  },\n)",
)
replace(
    'app/components/ApplyCandidateModal.vue',
    "async function createCandidate() {\n  const firstName = newCandidate.firstName.trim()\n  const lastName = newCandidate.lastName.trim()\n  const email = newCandidate.email.trim()\n  if (!firstName || !email) return void (applyError.value = 'First name and email are required. Last name may be left blank for a genuine single-name candidate.')\n  if (resumeFile.value && !identityReviewed.value) return void (applyError.value = 'Review and confirm the candidate identity before creating the candidate.')\n  await attachCandidate({\n    firstName,\n    lastName,\n    email,\n    phone: newCandidate.phone.trim() || undefined,\n    notes: newCandidate.notes.trim() || undefined,\n    source: source.value,\n  })\n}\n",
    "async function createCandidate() {\n  const firstName = newCandidate.firstName.trim()\n  const lastName = newCandidate.lastName.trim()\n  const email = newCandidate.email.trim()\n  const phone = newCandidate.phone.trim() || undefined\n  if (!firstName || !email) return void (applyError.value = 'First name and email are required. Last name may be left blank for a genuine single-name candidate.')\n  if (resumeFile.value && !identityReviewed.value) return void (applyError.value = 'Review and confirm the candidate identity before creating the candidate.')\n\n  if (!identityConflictCheck.value) {\n    try {\n      identityConflictCheck.value = await $fetch(`/api/jobs/${props.jobId}/candidate-identity-check`, {\n        method: 'POST',\n        body: { firstName, lastName, email, phone },\n      }) as CandidateIdentityConflictCheck\n    } catch (err: any) {\n      applyError.value = err?.data?.statusMessage ?? err?.message ?? 'Candidate identity could not be checked against the Candidate Database.'\n      return\n    }\n  }\n\n  if (identityConflictCheck.value.matched && identityConflictCheck.value.requiresConfirmation && !identityConflictConfirmed.value) {\n    applyError.value = 'A matching Candidate Database record has different identity details. Review the warning below and confirm before linking the existing record.'\n    return\n  }\n\n  if (identityConflictCheck.value.matched && identityConflictCheck.value.candidate?.id) {\n    await attachCandidate({ candidateId: identityConflictCheck.value.candidate.id, source: source.value })\n    return\n  }\n\n  await attachCandidate({\n    firstName,\n    lastName,\n    email,\n    phone,\n    notes: newCandidate.notes.trim() || undefined,\n    source: source.value,\n  })\n}\n",
)
replace(
    'app/components/ApplyCandidateModal.vue',
    "              <div class=\"grid gap-4 sm:grid-cols-2\">",
    "              <div v-if=\"identityConflictCheck?.matched && identityConflictCheck.requiresConfirmation\" data-testid=\"candidate-identity-conflict\" class=\"rounded-xl border border-warning-300 bg-warning-50 p-4 text-sm text-warning-900\">\n                <p class=\"font-semibold\">Possible duplicate identity conflict</p>\n                <p class=\"mt-1 text-xs leading-5\">A Candidate Database record already matches this {{ identityConflictCheck.matchBasis }}. The existing identity will not be overwritten. Compare the details below before linking it.</p>\n                <div class=\"mt-3 space-y-2\">\n                  <div v-for=\"conflict in identityConflictCheck.conflicts\" :key=\"conflict.field\" class=\"rounded-lg bg-white/80 px-3 py-2 text-xs\">\n                    <span class=\"font-semibold capitalize\">{{ conflict.field }}</span>: existing \"{{ conflict.existing }}\" vs entered \"{{ conflict.incoming }}\"\n                  </div>\n                </div>\n                <label class=\"mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-warning-200 bg-white p-3 text-xs\">\n                  <input v-model=\"identityConflictConfirmed\" data-testid=\"candidate-identity-conflict-confirm\" type=\"checkbox\" class=\"mt-0.5 size-4\" />\n                  <span><strong>Use the existing Candidate Database identity.</strong> I reviewed the differences and confirm this resume/candidate belongs to that existing person.</span>\n                </label>\n              </div>\n              <div class=\"grid gap-4 sm:grid-cols-2\">",
)

Path('tests/unit/pds-candidate-identity-conflict.test.ts').write_text("""import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { findCandidateIdentityConflicts } from '../../server/utils/candidateIdentityConflict'

const read = (path: string) => readFileSync(path, 'utf8')

describe('PDS candidate identity conflict protection', () => {
  it('detects materially different names on an existing database identity', () => {
    const conflicts = findCandidateIdentityConflicts(
      { firstName: 'Rahul', lastName: 'Sharma', email: 'rahul@example.com', phone: '+91 98765 43210' },
      { firstName: 'Rakesh', lastName: 'Sharma', email: 'rahul@example.com', phone: '+91 98765 43210' },
    )
    expect(conflicts.map(c => c.field)).toContain('name')
    expect(conflicts.map(c => c.field)).not.toContain('email')
  })

  it('normalizes case, whitespace and phone punctuation before comparing', () => {
    expect(findCandidateIdentityConflicts(
      { firstName: 'Cher', lastName: '', email: 'CHER@example.com', phone: '+91 98-7654-3210' },
      { firstName: '  cher ', lastName: '', email: 'cher@example.com', phone: '919876543210' },
    )).toEqual([])
  })

  it('checks email first and phone second in the preflight endpoint', () => {
    const endpoint = read('server/api/jobs/[id]/candidate-identity-check.post.ts')
    expect(endpoint).toContain('const matchedByEmail')
    expect(endpoint).toContain('const matchedByPhone = !matchedByEmail')
    expect(endpoint).toContain("matchBasis: matchedByEmail ? 'email' as const : 'phone' as const")
  })

  it('requires explicit recruiter confirmation before a conflicting existing identity is reused', () => {
    const modal = read('app/components/ApplyCandidateModal.vue')
    expect(modal).toContain('candidate-identity-conflict')
    expect(modal).toContain('candidate-identity-conflict-confirm')
    expect(modal).toContain('identityConflictConfirmed.value')
    expect(modal).toContain('Use the existing Candidate Database identity.')
    expect(modal).toContain('candidateId: identityConflictCheck.value.candidate.id')
  })

  it('enforces the conflict guard at the intake API and does not overwrite identity fields', () => {
    const intake = read('server/api/jobs/[id]/candidate-intake.post.ts')
    expect(intake).toContain('findCandidateIdentityConflicts(matchedCandidate, body)')
    expect(intake).toContain('Review the conflict and explicitly use the existing candidate record')
    expect(intake).not.toContain('db.update(candidate)')
  })
})
""")

# Extend the earlier identity-review regression to assert the new preflight rather than weakening it.
replace(
    'tests/unit/pds-resume-identity-review-ux.test.ts',
    "    expect(schema).toContain('lastName: z.string().trim().max(100).optional()')\n",
    "    expect(schema).toContain('lastName: z.string().trim().max(100).optional()')\n    expect(read('server/api/jobs/[id]/candidate-identity-check.post.ts')).toContain('const matchedByEmail')\n",
)
