import { z } from 'zod'

export const skillPrioritySchema = z.enum(['mandatory', 'preferred', 'optional'])

// Drafts are intentionally permissive. Recruiters must be able to save work in progress.
// Approval validates matrix structure and evidence quality without forcing arbitrary
// Mandatory-skill quotas that can make a JD-specific matrix generic.
// Client-normalized skill IDs may include both the classification and skill slugs,
// so allow enough room for a stable canonical ID. AI rationales may legitimately be null.
export const skillMatrixItemSchema = z.object({
  id: z.string().min(1).max(200),
  skill: z.string().trim().max(200),
  priority: skillPrioritySchema,
  rationale: z.string().trim().max(500).nullish(),
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

    if (!classification.skills.length) {
      ctx.addIssue({ code: 'custom', message: 'Every approved classification needs at least one assessable skill.', path: ['matrix', 'classifications', i, 'skills'] })
      continue
    }

    if (classification.skills.some(skill => !skill.skill.trim())) {
      ctx.addIssue({ code: 'custom', message: 'Approved Skill Matrix cannot contain blank skills.', path: ['matrix', 'classifications', i, 'skills'] })
    }

    mandatoryTotal += classification.skills.filter(s => s.priority === 'mandatory').length
  }

  if (mandatoryTotal < 1) {
    ctx.addIssue({ code: 'custom', message: 'Mark at least one genuinely role-critical criterion as Mandatory before approval.', path: ['matrix', 'classifications'] })
  }
})

export type SkillMatrixInput = z.infer<typeof skillMatrixSchema>
