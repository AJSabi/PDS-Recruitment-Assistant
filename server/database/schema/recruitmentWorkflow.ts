import { pgTable, text, timestamp, integer, boolean, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { organization, user } from './auth'
import { application, candidate, document, job } from './app'

export type CurrentFit = 'strong_fit' | 'potential_fit' | 'borderline_requires_validation' | 'significant_gap' | 'not_yet_assessed'
export type RecruitmentStage = 'candidate_added' | 'resume_received' | 'resume_reviewed' | 'recruiter_screening_pending' | 'recruiter_screening_completed' | 'hiring_manager_round_pending' | 'hiring_manager_round_completed' | 'hod_round_pending' | 'hod_round_completed' | 'hr_round_pending' | 'hr_round_completed' | 'hold_for_comparison' | 'reassess' | 'not_proceeding' | 'offer_stage' | 'offer_accepted' | 'offer_declined' | 'joined' | 'closed'
export type CandidatePriority = 'P1' | 'P2' | 'P3' | 'P4'
export type EvidenceType = 'resume' | 'recruiter_screening' | 'hiring_manager_interview' | 'hod_interview' | 'hr_interview' | 'interview' | 'manual_reassessment' | 'requirement_change' | 'stage_change' | 'assignment_change' | 'sourcing'
export type SkillEvidenceLevel = 'strong_evidence' | 'partial_evidence' | 'no_evidence_found' | 'requires_verification'
export type RequirementProfile = {
  functionName?: string | null
  hiringManager?: string | null
  experienceRequirement?: string | null
  openings?: number | null
  majorRequirements?: string[]
}
export type CandidateInterviewBrief = {
  round: 'recruiter_screening' | 'hiring_manager' | 'hod' | 'hr'
  brief: string
}
export type RecruitmentSkillAssessmentItem = {
  classification?: string | null
  skill: string
  priority: 'mandatory' | 'preferred' | 'optional'
  evidenceLevel: SkillEvidenceLevel
  evidence?: string | null
}
export type RecruiterScreeningQuestion = {
  id: string
  question: string
  options?: string[] | null
  verificationArea?: string | null
}

export const recruitmentRequirementState = pgTable('recruitment_requirement_state', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  jobId: text('job_id').notNull().references(() => job.id, { onDelete: 'cascade' }),
  ownerUserId: text('owner_user_id').references(() => user.id, { onDelete: 'set null' }),
  assignmentDate: timestamp('assignment_date'),
  targetClosureDate: timestamp('target_closure_date'),
  closedAt: timestamp('closed_at'),
  requirementProfile: jsonb('requirement_profile').$type<RequirementProfile>().notNull().default({}),
  revision: integer('revision').notNull().default(1),
  jdVersion: integer('jd_version').notNull().default(1),
  skillMatrixVersion: integer('skill_matrix_version').notNull().default(0),
  skillMatrixApproved: boolean('skill_matrix_approved').notNull().default(false),
  skillMatrixApprovedAt: timestamp('skill_matrix_approved_at'),
  lastMaterialChangeAt: timestamp('last_material_change_at'),
  reassessmentRequired: boolean('reassessment_required').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ([
  uniqueIndex('recruitment_requirement_state_job_idx').on(t.jobId),
  index('recruitment_requirement_state_org_idx').on(t.organizationId),
  index('recruitment_requirement_state_owner_idx').on(t.organizationId, t.ownerUserId),
  index('recruitment_requirement_state_target_idx').on(t.organizationId, t.targetClosureDate),
]))

export const recruitmentApplicationProfile = pgTable('recruitment_application_profile', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  applicationId: text('application_id').notNull().references(() => application.id, { onDelete: 'cascade' }),
  selectedResumeDocumentId: text('selected_resume_document_id').references(() => document.id, { onDelete: 'set null' }),
  assignedRecruiterId: text('assigned_recruiter_id').references(() => user.id, { onDelete: 'set null' }),
  currentFit: text('current_fit').$type<CurrentFit>().notNull().default('not_yet_assessed'),
  lastStatus: text('last_status').$type<RecruitmentStage>().notNull().default('candidate_added'),
  statusDate: timestamp('status_date').notNull().defaultNow(),
  lastContactAt: timestamp('last_contact_at'),
  resumeBrief: text('resume_brief'),
  conversationBrief: text('conversation_brief'),
  notes: text('notes'),
  priority: text('priority').$type<CandidatePriority>(),
  nextAction: text('next_action'),
  assessmentLocked: boolean('assessment_locked').notNull().default(false),
  lastUpdatedBy: text('last_updated_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ([
  uniqueIndex('recruitment_application_profile_application_idx').on(t.applicationId),
  index('recruitment_application_profile_org_idx').on(t.organizationId),
  index('recruitment_application_profile_recruiter_idx').on(t.organizationId, t.assignedRecruiterId),
  index('recruitment_application_profile_status_idx').on(t.organizationId, t.lastStatus),
]))

export const recruitmentSkillAssessment = pgTable('recruitment_skill_assessment', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  applicationId: text('application_id').notNull().references(() => application.id, { onDelete: 'cascade' }),
  skillMatrixVersion: integer('skill_matrix_version').notNull().default(1),
  items: jsonb('items').$type<RecruitmentSkillAssessmentItem[]>().notNull().default([]),
  currentFit: text('current_fit').$type<CurrentFit>().notNull().default('not_yet_assessed'),
  summary: text('summary'),
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ([
  index('recruitment_skill_assessment_application_idx').on(t.applicationId),
  index('recruitment_skill_assessment_org_idx').on(t.organizationId),
]))

export const recruiterScreeningSession = pgTable('recruiter_screening_session', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  applicationId: text('application_id').notNull().references(() => application.id, { onDelete: 'cascade' }),
  skillMatrixVersion: integer('skill_matrix_version').notNull().default(1),
  status: text('status').notNull().default('draft'),
  questions: jsonb('questions').$type<RecruiterScreeningQuestion[]>().notNull().default([]),
  responses: jsonb('responses').$type<Record<string, string>>().notNull().default({}),
  recruiterNotes: text('recruiter_notes'),
  recommendation: text('recommendation'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ([
  index('recruiter_screening_session_application_idx').on(t.applicationId),
  index('recruiter_screening_session_org_idx').on(t.organizationId),
]))

export const recruitmentEvidence = pgTable('recruitment_evidence', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  jobId: text('job_id').references(() => job.id, { onDelete: 'cascade' }),
  applicationId: text('application_id').references(() => application.id, { onDelete: 'cascade' }),
  candidateId: text('candidate_id').references(() => candidate.id, { onDelete: 'cascade' }),
  type: text('type').$type<EvidenceType>().notNull(),
  summary: text('summary').notNull(),
  sourceRef: text('source_ref'),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ([
  index('recruitment_evidence_application_idx').on(t.applicationId),
  index('recruitment_evidence_candidate_idx').on(t.candidateId),
  index('recruitment_evidence_job_idx').on(t.jobId),
  index('recruitment_evidence_org_idx').on(t.organizationId),
]))
