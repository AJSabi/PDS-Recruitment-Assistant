import { z } from 'zod'

export const currentFitSchema = z.enum(['strong_fit', 'potential_fit', 'borderline_requires_validation', 'significant_gap', 'not_yet_assessed'])
export const finalScreeningFitSchema = z.enum(['strong_fit', 'potential_fit', 'borderline_requires_validation', 'significant_gap'])
export const recruitmentStageSchema = z.enum(['candidate_added', 'resume_received', 'resume_reviewed', 'recruiter_screening_pending', 'recruiter_screening_completed', 'hod_round_pending', 'hod_round_completed', 'hold_for_comparison', 'reassess', 'not_proceeding', 'offer_stage', 'offer_accepted', 'offer_declined', 'joined', 'closed'])
export const candidatePrioritySchema = z.enum(['P1', 'P2', 'P3', 'P4'])
export const evidenceTypeSchema = z.enum(['resume', 'recruiter_screening', 'hod_interview', 'interview', 'manual_reassessment', 'requirement_change', 'stage_change'])
export const screeningNextStepSchema = z.enum(['proceed_to_hod_round', 'hold_for_comparison', 'reassess', 'recruiter_decision_required'])

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

export const screeningQuestionSchema = z.object({
  id: z.string().min(1).max(100),
  question: z.string().trim().min(1).max(1000),
  options: z.array(z.string().trim().min(1).max(500)).max(7).optional(),
  verificationArea: z.string().trim().max(500).optional(),
})

export const screeningResponseSchema = z.object({
  questionId: z.string().min(1).max(100),
  answer: z.string().trim().min(1).max(2000),
  answeredAt: z.string().datetime().optional(),
})

export const startScreeningSchema = z.object({
  questions: z.array(screeningQuestionSchema).min(1).max(10),
}).strict().superRefine((data, ctx) => {
  const ids = data.questions.map(q => q.id)
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: 'custom', message: 'Screening question IDs must be unique.', path: ['questions'] })
  }
})

export const answerScreeningQuestionSchema = z.object({
  questionId: z.string().min(1).max(100),
  answer: z.string().trim().min(1).max(2000),
}).strict()

export const completeScreeningSchema = z.object({
  finalFit: finalScreeningFitSchema,
  recommendedNextStep: screeningNextStepSchema,
  conversationBrief: z.string().trim().max(3000).nullish(),
  validationFocus: z.array(z.string().trim().min(1).max(500)).max(5).default([]),
}).strict()
