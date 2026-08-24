import { z } from 'zod'

export const skillPrioritySchema = z.enum(['mandatory', 'preferred', 'optional'])

// Drafts are intentionally permissive. Recruiters must be able to save work in progress.
// Strict business rules are enforced only when approved=true.
export const skillMatrixItemSchema = z.object({
  id: z.string().min(1).max(100),
  skill: z.string().trim().max(200),
  priority: skillPrioritySchema,
  rationale: z.string().trim().max(500).optional(),
})

export const skillMatrixClassificationSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().max(120),
  skills: z.array(skillMatrixItemSchema).max(8),
})

export const skillMatrixSchema = z.object({
  classifications: z.array(skillMatrixClassificationSchema).min(1).max(5),
}).superRefine((data, ctx) => {
  const classificationIds = data.classifications.map(c => c.id)
  if (new Set(classificationIds).size !== classificationIds.length) {
    ctx.addIssue({ code: 'custom', message: 'Classification IDs must be unique.', path: ['classifications'] })
  }

  const skillIds = data.classifications.flatMap(c => c.skills.map(s => s.id))
  if (new Set(skillIds).size !== skillIds.length) {
    ctx.addIssue({ code: 'custom', message: 'Skill IDs must be unique.', path: ['classifications'] })
  }
})

export const saveSkillMatrixSchema = z.object({
  matrix: skillMatrixSchema,
  approved: z.boolean().optional().default(false),
}).superRefine((data, ctx) => {
  if (!data.approved) return

  const classifications = data.matrix.classifications
  if (classifications.length < 4 || classifications.length > 5) {
    ctx.addIssue({ code: 'custom', message: 'An approved Skill Matrix must contain 4–5 classifications.', path: ['matrix', 'classifications'] })
  }

  let mandatoryTotal = 0
  for (const [i, classification] of classifications.entries()) {
    if (!classification.name.trim()) {
      ctx.addIssue({ code: 'custom', message: 'Every approved classification needs a name.', path: ['matrix', 'classifications', i, 'name'] })
    }

    if (classification.skills.some(skill => !skill.skill.trim())) {
      ctx.addIssue({ code: 'custom', message: 'Approved Skill Matrix cannot contain blank skills.', path: ['matrix', 'classifications', i, 'skills'] })
    }

    const mandatoryCount = classification.skills.filter(s => s.priority === 'mandatory').length
    mandatoryTotal += mandatoryCount
    if (mandatoryCount < 2 || mandatoryCount > 3) {
      ctx.addIssue({ code: 'custom', message: 'Each approved classification must contain 2–3 Mandatory skills.', path: ['matrix', 'classifications', i, 'skills'] })
    }
  }

  if (mandatoryTotal < 8 || mandatoryTotal > 12) {
    ctx.addIssue({ code: 'custom', message: 'An approved Skill Matrix must contain 8–12 Mandatory skills overall.', path: ['matrix', 'classifications'] })
  }
})

export type SkillMatrixInput = z.infer<typeof skillMatrixSchema>
