export type CandidateIdentityShape = {
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
  return (value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

function normalizePhone(value: string | null | undefined) {
  return (value ?? '').replace(/\D/g, '')
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
