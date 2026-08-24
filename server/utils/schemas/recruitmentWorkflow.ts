import { z } from 'zod'

export const currentFitSchema = z.enum(['strong_fit', 'potential_fit', 'borderline_requires_validation', 'significant_gap', 'not_yet_assessed'])
export const recruitmentStageSchema = z.enum(['resume_received', 'resume_reviewed', 'recruiter_screening_pending', 'recruiter_screening_completed', 'hod_round_pending', 'hod_round_completed', 'hold_for_comparison', 'reassess', 'not_proceeding', 'offer_stage', 'offer_accepted', 'offer_declined', 'joined', 'closed'])
export const candidatePrioritySchema = z.enum(['P1', 'P2', 'P3', 'P4'])
export const evidenceTypeSchema = z.enum(['resume', 'recruiter_screening', 'hod_interview', 'interview', 'manual_reassessment', 'requirement_change'])

export const updateRecruitmentProfileSchema = z.object({
  currentFit: currentFitSchema.optional(),
  lastStatus: recruitmentStageSchema.optional(),
  lastContactAt: z.coerce.date().nullish(),
  resumeBrief: z.string().trim().max(2000).nullish(),
  conversationBrief: z.string().trim().max(3000).nullish(),
  nextAction: z.string().trim().max(1000).nullish(),
  assessmentLocked: z.boolean().optional(),
  provisionalFitScore: z.number().int().min(0).max(100).nullish(),
  priority: candidatePrioritySchema.nullish(),
  mandatoryMatch: z.string().trim().max(1000).nullish(),
  keyStrength: z.string().trim().max(1000).nullish(),
  mainGap: z.string().trim().max(1000).nullish(),
  requirementVersionAssessed: z.number().int().min(0).optional(),
}).strict()

export const createEvidenceSchema = z.object({
  type: evidenceTypeSchema,
  summary: z.string().trim().max(3000).nullish(),
  payload: z.record(z.string(), z.unknown()).nullish(),
}).strict()

const screeningQuestionSchema = z.object({
  id: z.string().min(1).max(100),
  question: z.string().min(1).max(1000),
  options: z.array(z.string().max(500)).max(7).optional(),
  verificationArea: z.string().max(500).optional(),
})

const screeningResponseSchema = z.object({
  questionId: z.string().min(1).max(100),
  answer: z.string().max(2000),
  answeredAt: z.string().optional(),
})

export const upsertScreeningSchema = z.object({
  status: z.enum(['not_started', 'in_progress', 'completed']).optional(),
  questions: z.array(screeningQuestionSchema).max(10).optional(),
  responses: z.array(screeningResponseSchema).max(10).optional(),
  finalFit: currentFitSchema.nullish(),
  recommendedNextStep: z.string().trim().max(1000).nullish(),
  validationFocus: z.array(z.string().max(500)).max(10).optional(),
}).strict()
