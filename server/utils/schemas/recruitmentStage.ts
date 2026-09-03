import { z } from 'zod'
import { finalScreeningFitSchema, recruitmentStageSchema } from './recruitmentWorkflow'

export const CONFIRMED_STAGE_TRANSITIONS: Record<string, string[]> = {
  // Active candidates must use Not Proceeding before an unsuccessful closure.
  candidate_added: ['resume_received', 'not_proceeding'],
  resume_received: ['resume_reviewed', 'recruiter_screening_pending', 'not_proceeding'],
  resume_reviewed: ['recruiter_screening_pending', 'reassess', 'not_proceeding'],
  recruiter_screening_pending: ['recruiter_screening_completed', 'hold_for_comparison', 'reassess', 'not_proceeding'],
  recruiter_screening_completed: ['hiring_manager_round_pending', 'hold_for_comparison', 'reassess', 'not_proceeding'],
  hiring_manager_round_pending: ['hiring_manager_round_completed', 'hold_for_comparison', 'reassess', 'not_proceeding'],
  hiring_manager_round_completed: ['hod_round_pending', 'hold_for_comparison', 'reassess', 'not_proceeding'],
  hod_round_pending: ['hod_round_completed', 'hold_for_comparison', 'reassess', 'not_proceeding'],
  hod_round_completed: ['hr_round_pending', 'hold_for_comparison', 'reassess', 'not_proceeding'],
  hr_round_pending: ['hr_round_completed', 'hold_for_comparison', 'reassess', 'not_proceeding'],
  hr_round_completed: ['offer_stage', 'hold_for_comparison', 'reassess', 'not_proceeding'],

  // Hold can resume only through the recorded safe continuation enforced by stage/confirm.
  // It may alternatively enter Reassess or Not Proceeding, but cannot close directly.
  hold_for_comparison: ['recruiter_screening_pending', 'hiring_manager_round_pending', 'hod_round_pending', 'hr_round_pending', 'offer_stage', 'reassess', 'not_proceeding'],

  // Reassess is a governed reopening route. It returns to evidence/resume review or recruiter revalidation;
  // it cannot jump directly back into HM/HOD/HR/Offer stages.
  reassess: ['resume_received', 'resume_reviewed', 'recruiter_screening_pending', 'not_proceeding'],
  not_proceeding: ['reassess', 'closed'],

  // Offer handling is recruiter-confirmed and sequential: outcome first, then joining, then closure.
  offer_stage: ['offer_accepted', 'offer_declined', 'hold_for_comparison'],
  offer_accepted: ['joined', 'offer_declined'],
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
  interviewType: z.enum(['hiring_manager', 'hod', 'hr', 'interview']),
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