import { z } from 'zod'

export const skillPrioritySchema = z.enum(['mandatory', 'preferred', 'optional'])

export const skillMatrixItemSchema = z.object({
  id: z.string().min(1).max(100),
  skill: z.string().trim().min(1).max(200),
  priority: skillPrioritySchema,
  rationale: z.string().trim().max(500).optional(),
})

export const skillMatrixClassificationSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(120),
  skills: z.array(skillMatrixItemSchema).min(1).max(8),
})

export const skillMatrixSchema = z.object({
  classifications: z.array(skillMatrixClassificationSchema).min(1).max(5),
}).superRefine((data, ctx) => {
  const mandatory = data.classifications.flatMap(c => c.skills).filter(s => s.priority === 'mandatory')
  if (mandatory.length > 12) {
    ctx.addIssue({ code: 'custom', message: 'Use no more than 12 Mandatory skills overall.', path: ['classifications'] })
  }

  const classificationIds = data.classifications.map(c => c.id)
  if (new Set(classificationIds).size !== classificationIds.length) {
    ctx.addIssue({ code: 'custom', message: 'Classification IDs must be unique.', path: ['classifications'] })
  }

  const skillIds = data.classifications.flatMap(c => c.skills.map(s => s.id))
  if (new Set(skillIds).size !== skillIds.length) {
    ctx.addIssue({ code: 'custom', message: 'Skill IDs must be unique.', path: ['classifications'] })
  }

  for (const [i, classification] of data.classifications.entries()) {
    const mandatoryCount = classification.skills.filter(s => s.priority === 'mandatory').length
    if (mandatoryCount > 3) {
      ctx.addIssue({ code: 'custom', message: 'Use no more than 3 Mandatory skills per classification.', path: ['classifications', i, 'skills'] })
    }
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
