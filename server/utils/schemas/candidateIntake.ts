import { z } from 'zod'
import { RECRUITMENT_SOURCE_VALUES } from '../recruitmentSource'

const identityFieldSchema = z.enum(['name', 'email', 'phone'])

const reviewedIdentitySchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().max(100).default(''),
  email: z.string().trim().email().max(255).transform(value => value.toLowerCase()),
  phone: z.string().trim().max(50).nullable().optional(),
}).strict()

const identityConflictResolutionSchema = z.object({
  confirmed: z.literal(true),
  refreshedFields: z.array(identityFieldSchema).max(3).refine(values => new Set(values).size === values.length, 'Refreshed fields must be unique.'),
  reviewedIdentity: reviewedIdentitySchema,
}).strict()

export const candidateIntakeSchema = z.object({
  candidateId: z.string().min(1).optional(),
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  email: z.string().trim().email().max(255).transform(v => v.toLowerCase()).optional(),
  phone: z.string().trim().max(50).optional(),
  notes: z.string().trim().max(2000).optional(),
  source: z.enum(RECRUITMENT_SOURCE_VALUES).default('recruiter_sourcing'),
  identityConflictResolution: identityConflictResolutionSchema.optional(),
}).superRefine((data, ctx) => {
  if (data.identityConflictResolution && !data.candidateId) {
    ctx.addIssue({ code: 'custom', message: 'Identity conflict resolution is only valid when reusing an existing candidate.', path: ['identityConflictResolution'] })
  }
  if (data.candidateId) return
  if (!data.firstName) ctx.addIssue({ code: 'custom', message: 'First name is required for a new candidate.', path: ['firstName'] })
  if (!data.email) ctx.addIssue({ code: 'custom', message: 'Email is required for a new candidate.', path: ['email'] })
})

export type CandidateIntakeInput = z.infer<typeof candidateIntakeSchema>
