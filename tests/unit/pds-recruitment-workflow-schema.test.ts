import { describe, expect, it } from 'vitest'
import { saveSkillMatrixSchema } from '../../server/utils/schemas/skillMatrix'
import { candidateIntakeSchema } from '../../server/utils/schemas/candidateIntake'

function classification(id: string, name: string, skills: Array<{ id: string; skill: string; priority: 'mandatory' | 'preferred' | 'optional'; rationale?: string }>) {
  return { id, name, skills }
}

describe('PDS Skill Matrix approval rules', () => {
  it('allows a JD-specific approved matrix without forcing 2-3 Mandatory skills per classification', () => {
    const result = saveSkillMatrixSchema.safeParse({
      approved: true,
      matrix: {
        classifications: [
          classification('account_growth', 'Enterprise Account Growth & New Logo Acquisition', [
            { id: 'new_logo', skill: 'Independent new-logo acquisition ownership', priority: 'mandatory', rationale: 'Evidence from won accounts or target achievement.' },
            { id: 'account_mining', skill: 'Expansion of existing enterprise accounts', priority: 'preferred', rationale: 'Evidence from cross-sell or account growth.' },
          ]),
          classification('commercial', 'Revenue / Gross Margin & Deal Ownership', [
            { id: 'revenue_gm', skill: 'Revenue and gross-margin ownership', priority: 'preferred', rationale: 'Evidence from owned targets and achieved results.' },
          ]),
          classification('solution', 'IT Infrastructure Solution Understanding', [
            { id: 'infra_scope', skill: 'Enterprise infrastructure solution conversations', priority: 'preferred', rationale: 'Evidence from networking, data centre, cloud or cybersecurity opportunities.' },
          ]),
          classification('closure', 'Complex Proposal & Commercial Closure', [
            { id: 'commercial_closure', skill: 'Complex proposal and commercial closure ownership', priority: 'preferred', rationale: 'Evidence from RFP, negotiation and closure responsibility.' },
          ]),
        ],
      },
    })

    expect(result.success).toBe(true)
  })

  it('still requires 4-5 classifications for approval', () => {
    const result = saveSkillMatrixSchema.safeParse({
      approved: true,
      matrix: {
        classifications: [
          classification('one', 'One', [{ id: 'one_skill', skill: 'One skill', priority: 'mandatory' }]),
          classification('two', 'Two', [{ id: 'two_skill', skill: 'Two skill', priority: 'preferred' }]),
          classification('three', 'Three', [{ id: 'three_skill', skill: 'Three skill', priority: 'preferred' }]),
        ],
      },
    })

    expect(result.success).toBe(false)
  })

  it('requires at least one genuine Mandatory hiring gate overall', () => {
    const result = saveSkillMatrixSchema.safeParse({
      approved: true,
      matrix: {
        classifications: [
          classification('one', 'One', [{ id: 'one_skill', skill: 'One skill', priority: 'preferred' }]),
          classification('two', 'Two', [{ id: 'two_skill', skill: 'Two skill', priority: 'preferred' }]),
          classification('three', 'Three', [{ id: 'three_skill', skill: 'Three skill', priority: 'optional' }]),
          classification('four', 'Four', [{ id: 'four_skill', skill: 'Four skill', priority: 'preferred' }]),
        ],
      },
    })

    expect(result.success).toBe(false)
  })

  it('allows incomplete work to be saved as a draft', () => {
    const result = saveSkillMatrixSchema.safeParse({
      approved: false,
      matrix: {
        classifications: [
          classification('draft', '', [{ id: 'draft_skill', skill: '', priority: 'preferred' }]),
        ],
      },
    })

    expect(result.success).toBe(true)
  })
})

describe('PDS direct candidate intake validation', () => {
  it('accepts linking an existing candidate to the current requirement', () => {
    const result = candidateIntakeSchema.safeParse({ candidateId: 'candidate-123' })
    expect(result.success).toBe(true)
  })

  it('accepts a new candidate entered directly inside the requirement', () => {
    const result = candidateIntakeSchema.parse({
      firstName: '  Asha  ',
      lastName: '  Mehta  ',
      email: '  ASHA.MEHTA@EXAMPLE.COM  ',
      phone: '9876543210',
      notes: '  Added from recruiter screening.  ',
    })

    expect(result.firstName).toBe('Asha')
    expect(result.lastName).toBe('Mehta')
    expect(result.email).toBe('asha.mehta@example.com')
    expect(result.notes).toBe('Added from recruiter screening.')
  })

  it('requires name and email when creating a new candidate', () => {
    expect(candidateIntakeSchema.safeParse({ firstName: 'Asha' }).success).toBe(false)
    expect(candidateIntakeSchema.safeParse({ firstName: 'Asha', lastName: 'Mehta' }).success).toBe(false)
  })
})
