import { describe, expect, it } from 'vitest'
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
