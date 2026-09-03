import { z } from 'zod'

export const evidenceLevelSchema = z.enum(['strong_evidence', 'partial_evidence', 'no_evidence_found', 'requires_verification'])

export const resumeSkillAssessmentSchema = z.object({
  classification: z.string().max(120).optional(),
  skill: z.string().min(1).max(200),
  priority: z.enum(['mandatory', 'preferred', 'optional']),
  evidenceLevel: evidenceLevelSchema,
  evidence: z.string().max(1000).optional(),
})

export const saveResumeAssessmentSchema = z.object({
  candidateSnapshot: z.string().max(4000).nullish(),
  jdAlignment: z.string().max(4000).nullish(),
  skillAssessment: z.array(resumeSkillAssessmentSchema).max(100).default([]),
  keyGaps: z.array(z.string().max(500)).max(20).default([]),
  verificationAreas: z.array(z.string().max(500)).max(20).default([]),
  mandatoryScore: z.number().int().min(0).max(100).nullish(),
  preferredScore: z.number().int().min(0).max(100).nullish(),
  experienceScore: z.number().int().min(0).max(100).nullish(),
  optionalScore: z.number().int().min(0).max(100).nullish(),
  mandatoryMatch: z.string().max(500).nullish(),
  keyStrength: z.string().max(1000).nullish(),
  mainGap: z.string().max(1000).nullish(),
  source: z.enum(['manual', 'ai']).default('manual'),
}).strict().superRefine((data, ctx) => {
  const scores = [data.mandatoryScore, data.preferredScore, data.experienceScore, data.optionalScore]
  const supplied = scores.filter(value => value != null).length
  if (supplied !== 0 && supplied !== 4) {
    ctx.addIssue({
      code: 'custom',
      message: 'Provide all four component scores or leave all four blank.',
      path: ['mandatoryScore'],
    })
  }
})
