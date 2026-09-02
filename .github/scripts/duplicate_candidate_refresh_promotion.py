from pathlib import Path


def replace(path: str, old: str, new: str, count: int = 1) -> None:
    p = Path(path)
    s = p.read_text()
    actual = s.count(old)
    if actual != count:
        raise SystemExit(f'{path}: expected {count}, found {actual} for {old[:140]!r}')
    p.write_text(s.replace(old, new, count))

path = 'app/components/ApplyCandidateModal.vue'

replace(
    path,
    "const identityConflictCheck = ref<CandidateIdentityConflictCheck | null>(null)\nconst identityConflictConfirmed = ref(false)\n",
    "const identityConflictCheck = ref<CandidateIdentityConflictCheck | null>(null)\nconst identityConflictConfirmed = ref(false)\nconst identityUpdateFields = reactive({ name: false, email: false, phone: false })\n",
)

replace(
    path,
    "  identityConflictCheck.value = null\n  identityConflictConfirmed.value = false\n  source.value = value === 'existing' ? 'existing_database' : 'recruiter_sourcing'\n",
    "  identityConflictCheck.value = null\n  identityConflictConfirmed.value = false\n  identityUpdateFields.name = false\n  identityUpdateFields.email = false\n  identityUpdateFields.phone = false\n  source.value = value === 'existing' ? 'existing_database' : 'recruiter_sourcing'\n",
)

replace(
    path,
    "    identityConflictCheck.value = null\n    identityConflictConfirmed.value = false\n  },\n)",
    "    identityConflictCheck.value = null\n    identityConflictConfirmed.value = false\n    identityUpdateFields.name = false\n    identityUpdateFields.email = false\n    identityUpdateFields.phone = false\n  },\n)",
)

old_block = """  if (identityConflictCheck.value.matched && identityConflictCheck.value.candidate?.id) {
    await attachCandidate({ candidateId: identityConflictCheck.value.candidate.id, source: source.value })
    return
  }
"""
new_block = """  if (identityConflictCheck.value.matched && identityConflictCheck.value.candidate?.id) {
    const existingCandidateId = identityConflictCheck.value.candidate.id
    const updatePayload: Record<string, string | null> = {}
    if (identityUpdateFields.name) {
      updatePayload.firstName = firstName
      updatePayload.lastName = lastName
    }
    if (identityUpdateFields.email) updatePayload.email = email
    if (identityUpdateFields.phone) updatePayload.phone = phone ?? null

    if (Object.keys(updatePayload).length) {
      try {
        await $fetch(`/api/candidates/${existingCandidateId}`, { method: 'PATCH', body: updatePayload })
        await refreshNuxtData('candidates')
      } catch (err: any) {
        applyError.value = err?.data?.statusMessage ?? err?.message ?? 'The existing candidate details could not be updated.'
        return
      }
    }

    await attachCandidate({ candidateId: existingCandidateId, source: source.value })
    return
  }
"""
replace(path, old_block, new_block)

old_card = """                <p class=\"mt-1 text-xs leading-5\">A Candidate Database record already matches this {{ identityConflictCheck.matchBasis }}. The existing identity will not be overwritten. Compare the details below before linking it.</p>
                <div class=\"mt-3 space-y-2\">
                  <div v-for=\"conflict in identityConflictCheck.conflicts\" :key=\"conflict.field\" class=\"rounded-lg bg-white/80 px-3 py-2 text-xs\">
                    <span class=\"font-semibold capitalize\">{{ conflict.field }}</span>: existing \"{{ conflict.existing }}\" vs entered \"{{ conflict.incoming }}\"
                  </div>
                </div>
                <label class=\"mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-warning-200 bg-white p-3 text-xs\">
                  <input v-model=\"identityConflictConfirmed\" data-testid=\"candidate-identity-conflict-confirm\" type=\"checkbox\" class=\"mt-0.5 size-4\" />
                  <span><strong>Use the existing Candidate Database identity.</strong> I reviewed the differences and confirm this resume/candidate belongs to that existing person.</span>
                </label>
"""
new_card = """                <p class=\"mt-1 text-xs leading-5\">A Candidate Database record already matches this {{ identityConflictCheck.matchBasis }}. This may be the same person returning with a newer resume. The existing record will be reused rather than creating a duplicate.</p>
                <div class=\"mt-3 rounded-lg border border-[#CFE0ED] bg-[#F7FBFE] px-3 py-2 text-xs text-[#1F6FA3]\">
                  <strong>Document history:</strong> if a resume is attached, it will be added as a new document on the existing candidate profile. Older resumes remain available in Documents for history and comparison.
                </div>
                <div class=\"mt-3 space-y-2\">
                  <label v-for=\"conflict in identityConflictCheck.conflicts\" :key=\"conflict.field\" class=\"flex items-start gap-2 rounded-lg bg-white/80 px-3 py-2 text-xs\">
                    <input v-model=\"identityUpdateFields[conflict.field]\" type=\"checkbox\" class=\"mt-0.5 size-4\" />
                    <span><span class=\"font-semibold capitalize\">{{ conflict.field }}</span>: existing \"{{ conflict.existing }}\" → newer \"{{ conflict.incoming }}\"<br><span class=\"text-surface-500\">Select to update this field on the existing Candidate Database profile.</span></span>
                  </label>
                </div>
                <div class=\"mt-3 flex flex-wrap gap-2\">
                  <NuxtLink v-if=\"identityConflictCheck.candidate?.id\" :to=\"localePath(`/dashboard/candidates/${identityConflictCheck.candidate.id}`)\" target=\"_blank\" class=\"rounded-lg border border-warning-300 bg-white px-3 py-2 text-xs font-semibold text-warning-900 no-underline\">Open existing candidate profile / documents</NuxtLink>
                </div>
                <label class=\"mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-warning-200 bg-white p-3 text-xs\">
                  <input v-model=\"identityConflictConfirmed\" data-testid=\"candidate-identity-conflict-confirm\" type=\"checkbox\" class=\"mt-0.5 size-4\" />
                  <span><strong>Use this existing Candidate Database record.</strong> I reviewed the differences, selected any fields that should be refreshed, and confirm the newer resume belongs to this person.</span>
                </label>
"""
replace(path, old_card, new_card)

# Regression coverage.
Path('tests/unit/pds-duplicate-candidate-refresh.test.ts').write_text("""import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const modal = readFileSync('app/components/ApplyCandidateModal.vue', 'utf8')
const detail = readFileSync('app/pages/dashboard/candidates/[id].vue', 'utf8')
const patch = readFileSync('server/api/candidates/[id].patch.ts', 'utf8')

describe('PDS duplicate candidate refresh workflow', () => {
  it('keeps the new resume as document history on the existing candidate', () => {
    expect(modal).toContain('it will be added as a new document on the existing candidate profile')
    expect(modal).toContain('Older resumes remain available in Documents for history and comparison.')
    expect(modal).toContain('await attachCandidate({ candidateId: existingCandidateId')
    expect(modal).toContain('uploadResume(candidateId)')
    expect(detail).toContain('Candidate Documents')
    expect(detail).toContain('uploadDocument(candidateId, file, selectedDocType.value)')
  })

  it('lets the recruiter selectively refresh changed identity/contact fields', () => {
    expect(modal).toContain('identityUpdateFields')
    expect(modal).toContain("if (identityUpdateFields.name)")
    expect(modal).toContain("if (identityUpdateFields.email)")
    expect(modal).toContain("if (identityUpdateFields.phone)")
    expect(modal).toContain("method: 'PATCH'")
    expect(modal).toContain('Select to update this field on the existing Candidate Database profile.')
  })

  it('does not silently overwrite unselected fields', () => {
    expect(modal).toContain('const updatePayload: Record<string, string | null> = {}')
    expect(patch).toContain('// If email is being changed, check uniqueness within the org')
    expect(patch).toContain("statusMessage: 'A candidate with this email already exists'")
  })

  it('offers direct access to the existing candidate profile and documents', () => {
    expect(modal).toContain('Open existing candidate profile / documents')
    expect(modal).toContain('`/dashboard/candidates/${identityConflictCheck.candidate.id}`')
  })
})
""")
