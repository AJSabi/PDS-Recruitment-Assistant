from pathlib import Path


def replace(path: str, old: str, new: str, count: int = 1) -> None:
    p = Path(path)
    s = p.read_text()
    actual = s.count(old)
    if actual != count:
        raise SystemExit(f'{path}: expected {count}, found {actual} for {old[:120]!r}')
    p.write_text(s.replace(old, new, count))

# Shared recruiter intake contract: last name may be blank for genuine single-name candidates.
replace(
    'server/utils/schemas/candidateIntake.ts',
    "  lastName: z.string().trim().min(1).max(100).optional(),",
    "  lastName: z.string().trim().max(100).optional(),",
)
replace(
    'server/utils/schemas/candidateIntake.ts',
    "  if (!data.lastName) ctx.addIssue({ code: 'custom', message: 'Last name is required for a new candidate.', path: ['lastName'] })\n",
    '',
)
replace(
    'server/api/jobs/[id]/candidate-intake.post.ts',
    '        lastName: body.lastName!,',
    "        lastName: body.lastName ?? '',",
)

# Central Candidate Database API contract uses an empty string to satisfy the existing NOT NULL column.
replace(
    'server/utils/schemas/candidate.ts',
    "  lastName: z.string().min(1, 'Last name is required').max(100),",
    "  lastName: z.string().trim().max(100).optional().default(''),",
    1,
)
replace(
    'server/utils/schemas/candidate.ts',
    "  lastName: z.string().min(1, 'Last name is required').max(100).optional(),",
    "  lastName: z.string().trim().max(100).optional(),",
    1,
)

# Avoid trailing whitespace in activity metadata for single-name candidates.
replace(
    'server/api/candidates/index.post.ts',
    "    metadata: { name: `${created.firstName} ${created.lastName}` },",
    "    metadata: { name: [created.firstName, created.lastName].filter(Boolean).join(' ') },",
)
replace(
    'server/api/candidates/[id].patch.ts',
    "    metadata: { name: `${updated.firstName} ${updated.lastName}` },",
    "    metadata: { name: [updated.firstName, updated.lastName].filter(Boolean).join(' ') },",
)

# Recruiter Add Candidate modal.
replace(
    'app/components/ApplyCandidateModal.vue',
    "  if (!firstName || !lastName || !email) return void (applyError.value = 'First name, last name and email are required.')",
    "  if (!firstName || !email) return void (applyError.value = 'First name and email are required. Last name may be left blank for a genuine single-name candidate.')",
)
replace(
    'app/components/ApplyCandidateModal.vue',
    '                <label class="text-sm font-medium">Last name <span class="text-danger-500">*</span><input v-model="newCandidate.lastName" :disabled="isApplying" class="mt-1.5 w-full rounded-lg border border-surface-300 px-3 py-2.5 text-sm" /></label>',
    '                <label class="text-sm font-medium">Last name <span class="font-normal text-surface-400">(optional for single-name candidates)</span><input v-model="newCandidate.lastName" :disabled="isApplying" class="mt-1.5 w-full rounded-lg border border-surface-300 px-3 py-2.5 text-sm" /></label>',
)

# Standalone Candidate Database create page.
replace(
    'app/pages/dashboard/candidates/new.vue',
    "  lastName: z.string().min(1, 'Last name is required').max(100),",
    "  lastName: z.string().trim().max(100),",
)
replace(
    'app/pages/dashboard/candidates/new.vue',
    '          Last Name <span class="text-danger-500">*</span>',
    '          Last Name <span class="ml-1 text-xs font-normal text-surface-400">(optional for single-name candidates)</span>',
)

# Candidate edit page: allow correcting an existing record to a single-name identity.
replace(
    'app/pages/dashboard/candidates/[id].vue',
    "useSeoMeta({ title: computed(() => candidate.value ? `${candidate.value.firstName} ${candidate.value.lastName}` : 'Candidate') })",
    "useSeoMeta({ title: computed(() => candidate.value ? formatCandidateName(candidate.value) : 'Candidate') })",
)
replace(
    'app/pages/dashboard/candidates/[id].vue',
    "  lastName: z.string().min(1, 'Last name is required').max(100),",
    "  lastName: z.string().trim().max(100),",
)
replace(
    'app/pages/dashboard/candidates/[id].vue',
    '<label class="text-sm">Last name<input v-model="editForm.lastName" class="mt-1 w-full rounded-lg border border-surface-300 px-3 py-2" /></label>',
    '<label class="text-sm">Last name <span class="text-xs text-surface-400">(optional for single-name candidates)</span><input v-model="editForm.lastName" class="mt-1 w-full rounded-lg border border-surface-300 px-3 py-2" /></label>',
)

Path('tests/unit/pds-single-name-candidate-support.test.ts').write_text("""import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { candidateIntakeSchema } from '../../server/utils/schemas/candidateIntake'
import { createCandidateSchema, updateCandidateSchema } from '../../server/utils/schemas/candidate'

const read = (path: string) => readFileSync(path, 'utf8')

describe('PDS single-name candidate support', () => {
  it('accepts recruiter intake without a last name while preserving required identity anchors', () => {
    const parsed = candidateIntakeSchema.parse({ firstName: 'Cher', email: 'cher@example.com' })
    expect(parsed.firstName).toBe('Cher')
    expect(parsed.lastName).toBeUndefined()
    expect(parsed.email).toBe('cher@example.com')
  })

  it('normalizes central Candidate Database creation to the existing non-null storage contract', () => {
    const parsed = createCandidateSchema.parse({ firstName: 'Madonna', email: 'madonna@example.com' })
    expect(parsed.lastName).toBe('')
    const updated = updateCandidateSchema.parse({ lastName: '' })
    expect(updated.lastName).toBe('')
  })

  it('stores an empty last-name string without changing the database column or migrations', () => {
    const intake = read('server/api/jobs/[id]/candidate-intake.post.ts')
    const schema = read('server/database/schema/app.ts')
    expect(intake).toContain("lastName: body.lastName ?? ''")
    expect(schema).toContain("lastName: text('last_name').notNull()")
  })

  it('keeps display formatting single-name safe and removes last-name requirements from recruiter UI', () => {
    const formatter = read('app/composables/useOrgSettings.ts')
    const modal = read('app/components/ApplyCandidateModal.vue')
    const createPage = read('app/pages/dashboard/candidates/new.vue')
    const editPage = read('app/pages/dashboard/candidates/[id].vue')
    expect(formatter).toContain('if (!last) return first')
    expect(modal).toContain('optional for single-name candidates')
    expect(modal).not.toContain('First name, last name and email are required.')
    expect(createPage).toContain('optional for single-name candidates')
    expect(editPage).toContain('optional for single-name candidates')
  })

  it('keeps email-first then phone dedupe unchanged', () => {
    const intake = read('server/api/jobs/[id]/candidate-intake.post.ts')
    expect(intake).toContain('const matchedByEmail')
    expect(intake).toContain('const matchedByPhone = !matchedByEmail')
    expect(intake).toContain("dedupeOrder: 'email_then_phone'")
  })
})
""")
