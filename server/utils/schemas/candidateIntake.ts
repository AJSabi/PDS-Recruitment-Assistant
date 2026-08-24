import { z } from 'zod'

export const candidateIntakeSchema = z.object({
  candidateId: z.string().min(1).optional(),
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  email: z.string().trim().email().max(255).transform(v => v.toLowerCase()).optional(),
  phone: z.string().trim().max(50).optional(),
  notes: z.string().trim().max(2000).optional(),
}).superRefine((data, ctx) => {
  if (data.candidateId) return
  if (!data.firstName) ctx.addIssue({ code: 'custom', message: 'First name is required for a new candidate.', path: ['firstName'] })
  if (!data.lastName) ctx.addIssue({ code: 'custom', message: 'Last name is required for a new candidate.', path: ['lastName'] })
  if (!data.email) ctx.addIssue({ code: 'custom', message: 'Email is required for a new candidate.', path: ['email'] })
})

export type CandidateIntakeInput = z.infer<typeof candidateIntakeSchema>
