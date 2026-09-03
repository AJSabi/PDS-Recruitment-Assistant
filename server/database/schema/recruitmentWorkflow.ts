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
  nextAction: text('next_action'),
  assessmentLocked: boolean('assessment_locked').notNull().default(false),
  provisionalFitScore: integer('provisional_fit_score'),
  priority: text('priority').$type<CandidatePriority>(),
  mandatoryMatch: text('mandatory_match'),
  keyStrength: text('key_strength'),
  mainGap: text('main_gap'),
  aiCandidateSummary: text('ai_candidate_summary'),
  aiOverallAssessment: text('ai_overall_assessment'),
  aiInterviewBriefs: jsonb('ai_interview_briefs').$type<CandidateInterviewBrief[]>().notNull().default([]),
  aiFinalBrief: text('ai_final_brief'),
  aiEvidenceConfidence: text('ai_evidence_confidence').$type<'high' | 'medium' | 'limited'>(),
  aiSummaryStale: boolean('ai_summary_stale').notNull().default(true),
  aiSummaryUpdatedAt: timestamp('ai_summary_updated_at'),
  requirementVersionAssessed: integer('requirement_version_assessed').notNull().default(0),
  lastUpdatedBy: text('last_updated_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ([
  uniqueIndex('recruitment_application_profile_app_idx').on(t.applicationId),
  index('recruitment_application_profile_org_idx').on(t.organizationId),
  index('recruitment_application_profile_fit_idx').on(t.organizationId, t.currentFit),
  index('recruitment_application_profile_status_idx').on(t.organizationId, t.lastStatus),
  index('recruitment_application_profile_resume_idx').on(t.selectedResumeDocumentId),
  index('recruitment_application_profile_recruiter_idx').on(t.organizationId, t.assignedRecruiterId),
]))

export const resumeAssessment = pgTable('resume_assessment', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  applicationId: text('application_id').notNull().references(() => application.id, { onDelete: 'cascade' }),
  candidateSnapshot: text('candidate_snapshot'),
  jdAlignment: text('jd_alignment'),
  skillAssessment: jsonb('skill_assessment').$type<RecruitmentSkillAssessmentItem[]>().notNull().default([]),
  keyGaps: jsonb('key_gaps').$type<string[]>().notNull().default([]),
  verificationAreas: jsonb('verification_areas').$type<string[]>().notNull().default([]),
  mandatoryScore: integer('mandatory_score'),
  preferredScore: integer('preferred_score'),
  experienceScore: integer('experience_score'),
  optionalScore: integer('optional_score'),
  provisionalFitScore: integer('provisional_fit_score'),
  mandatoryMatch: text('mandatory_match'),
  keyStrength: text('key_strength'),
  mainGap: text('main_gap'),
  priority: text('priority').$type<CandidatePriority>(),
  requirementVersion: integer('requirement_version').notNull().default(0),
  source: text('source').$type<'manual' | 'ai'>().notNull().default('manual'),
  assessedBy: text('assessed_by'),
  assessedAt: timestamp('assessed_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ([
  uniqueIndex('resume_assessment_app_idx').on(t.applicationId),
  index('resume_assessment_org_idx').on(t.organizationId),
  index('resume_assessment_priority_idx').on(t.organizationId, t.priority),
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

export const recruitmentEvidence = pgTable('recruitment_evidence', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  jobId: text('job_id').references(() => job.id, { onDelete: 'cascade' }),
  applicationId: text('application_id').notNull().references(() => application.id, { onDelete: 'cascade' }),
  candidateId: text('candidate_id').references(() => candidate.id, { onDelete: 'cascade' }),
  type: text('type').$type<EvidenceType>().notNull(),
  summary: text('summary'),
  sourceRef: text('source_ref'),
  payload: jsonb('payload').$type<Record<string, unknown> | null>(),
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ([
  index('recruitment_evidence_org_idx').on(t.organizationId),
  index('recruitment_evidence_application_idx').on(t.applicationId),
  index('recruitment_evidence_type_idx').on(t.applicationId, t.type),
  index('recruitment_evidence_candidate_idx').on(t.candidateId),
  index('recruitment_evidence_job_idx').on(t.jobId),
]))

export const recruiterScreeningSession = pgTable('recruiter_screening_session', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  applicationId: text('application_id').notNull().references(() => application.id, { onDelete: 'cascade' }),
  skillMatrixVersion: integer('skill_matrix_version').notNull().default(1),
  status: text('status').$type<'not_started' | 'in_progress' | 'completed'>().notNull().default('not_started'),
  questions: jsonb('questions').$type<RecruiterScreeningQuestion[]>().notNull().default([]),
  responses: jsonb('responses').$type<Array<{ questionId: string; answer: string; answeredAt?: string }>>().notNull().default([]),
  finalFit: text('final_fit').$type<Exclude<CurrentFit, 'not_yet_assessed'>>(),
  recommendedNextStep: text('recommended_next_step').$type<'proceed_to_hiring_manager_round' | 'hold_for_comparison' | 'reassess' | 'recruiter_decision_required'>(),
  conversationBrief: text('conversation_brief'),
  validationFocus: jsonb('validation_focus').$type<string[]>().notNull().default([]),
  recruiterNotes: text('recruiter_notes'),
  recommendation: text('recommendation'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ([
  uniqueIndex('recruiter_screening_session_app_idx').on(t.applicationId),
  index('recruiter_screening_session_org_idx').on(t.organizationId),
]))

export const talentPoolMatch = pgTable('talent_pool_match', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  jobId: text('job_id').notNull().references(() => job.id, { onDelete: 'cascade' }),
  candidateId: text('candidate_id').notNull().references(() => candidate.id, { onDelete: 'cascade' }),
  resumeDocumentId: text('resume_document_id').references(() => document.id, { onDelete: 'set null' }),
  requirementVersion: integer('requirement_version').notNull().default(0),
  mandatoryScore: integer('mandatory_score'),
  preferredScore: integer('preferred_score'),
  experienceScore: integer('experience_score'),
  optionalScore: integer('optional_score'),
  score: integer('score'),
  priority: text('priority').$type<CandidatePriority>(),
  mandatoryMatch: text('mandatory_match'),
  keyStrength: text('key_strength'),
  mainGap: text('main_gap'),
  candidateSnapshot: text('candidate_snapshot'),
  jdAlignment: text('jd_alignment'),
  skillAssessment: jsonb('skill_assessment').$type<RecruitmentSkillAssessmentItem[]>().notNull().default([]),
  keyGaps: jsonb('key_gaps').$type<string[]>().notNull().default([]),
  verificationAreas: jsonb('verification_areas').$type<string[]>().notNull().default([]),
  source: text('source').$type<'database' | 'jd_upload'>().notNull().default('database'),
  promotedApplicationId: text('promoted_application_id').references(() => application.id, { onDelete: 'set null' }),
  assessedAt: timestamp('assessed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ([
  uniqueIndex('talent_pool_match_job_candidate_idx').on(t.organizationId, t.jobId, t.candidateId),
  index('talent_pool_match_job_score_idx').on(t.organizationId, t.jobId, t.score),
  index('talent_pool_match_candidate_idx').on(t.organizationId, t.candidateId),
  index('talent_pool_match_resume_idx').on(t.resumeDocumentId),
]))
