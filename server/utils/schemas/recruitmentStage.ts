import { z } from 'zod'
import { finalScreeningFitSchema, recruitmentStageSchema } from './recruitmentWorkflow'

export const CONFIRMED_STAGE_TRANSITIONS: Record<string, string[]> = {
  candidate_added: ['resume_received', 'not_proceeding', 'closed'],
  resume_received: ['resume_reviewed', 'recruiter_screening_pending', 'not_proceeding', 'closed'],
  resume_reviewed: ['recruiter_screening_pending', 'hold_for_comparison', 'reassess', 'not_proceeding', 'closed'],
  recruiter_screening_pending: ['recruiter_screening_completed', 'hold_for_comparison', 'reassess', 'not_proceeding', 'closed'],
  recruiter_screening_completed: ['hod_round_pending', 'hold_for_comparison', 'reassess', 'not_proceeding', 'closed'],
  hod_round_pending: ['hod_round_completed', 'hold_for_comparison', 'reassess', 'not_proceeding', 'closed'],
  hod_round_completed: ['offer_stage', 'hold_for_comparison', 'reassess', 'not_proceeding', 'closed'],
  hold_for_comparison: ['recruiter_screening_pending', 'hod_round_pending', 'reassess', 'not_proceeding', 'closed'],
  reassess: ['resume_received', 'resume_reviewed', 'recruiter_screening_pending', 'hod_round_pending', 'hold_for_comparison', 'not_proceeding', 'closed'],
  not_proceeding: ['reassess', 'closed'],
  offer_stage: ['offer_accepted', 'offer_declined', 'hold_for_comparison', 'closed'],
  offer_accepted: ['joined', 'offer_declined', 'closed'],
  offer_declined: ['reassess', 'closed'],
  joined: ['closed'],
  closed: [],
}

export const confirmRecruitmentStageSchema = z.object({
  stage: recruitmentStageSchema,
  note: z.string().trim().max(2000).nullish(),
  nextAction: z.string().trim().max(1000).nullish(),
  contactOccurred: z.boolean().optional().default(false),
}).strict()

export const interviewEvidenceSchema = z.object({
  interviewType: z.enum(['hod', 'interview']),
  summary: z.string().trim().min(1).max(4000),
  fit: finalScreeningFitSchema.optional(),
  strengths: z.array(z.string().trim().min(1).max(500)).max(10).default([]),
  concerns: z.array(z.string().trim().min(1).max(500)).max(10).default([]),
  validationFocus: z.array(z.string().trim().min(1).max(500)).max(10).default([]),
  recommendation: z.enum(['proceed', 'hold', 'reassess', 'not_proceeding', 'offer']).optional(),
  updateCurrentFit: z.boolean().optional().default(false),
}).strict().superRefine((data, ctx) => {
  if (data.updateCurrentFit && !data.fit) {
    ctx.addIssue({ code: 'custom', message: 'Fit is required when updateCurrentFit is true.', path: ['fit'] })
  }
})
