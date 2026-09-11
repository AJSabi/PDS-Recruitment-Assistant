CREATE TABLE IF NOT EXISTS "recruitment_requirement_state" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "job_id" text NOT NULL REFERENCES "job"("id") ON DELETE CASCADE,
  "revision" integer DEFAULT 1 NOT NULL,
  "jd_version" integer DEFAULT 1 NOT NULL,
  "skill_matrix_version" integer DEFAULT 0 NOT NULL,
  "skill_matrix_approved" boolean DEFAULT false NOT NULL,
  "skill_matrix_approved_at" timestamp,
  "last_material_change_at" timestamp,
  "reassessment_required" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "recruitment_requirement_state_job_idx" ON "recruitment_requirement_state" USING btree ("job_id");
CREATE INDEX IF NOT EXISTS "recruitment_requirement_state_org_idx" ON "recruitment_requirement_state" USING btree ("organization_id");

CREATE TABLE IF NOT EXISTS "recruitment_application_profile" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "application_id" text NOT NULL REFERENCES "application"("id") ON DELETE CASCADE,
  "current_fit" text DEFAULT 'not_yet_assessed' NOT NULL,
  "last_status" text DEFAULT 'candidate_added' NOT NULL,
  "status_date" timestamp DEFAULT now() NOT NULL,
  "last_contact_at" timestamp,
  "resume_brief" text,
  "conversation_brief" text,
  "next_action" text,
  "assessment_locked" boolean DEFAULT false NOT NULL,
  "provisional_fit_score" integer,
  "priority" text,
  "mandatory_match" text,
  "key_strength" text,
  "main_gap" text,
  "requirement_version_assessed" integer DEFAULT 0 NOT NULL,
  "last_updated_by" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "recruitment_application_profile_app_idx" ON "recruitment_application_profile" USING btree ("application_id");
CREATE INDEX IF NOT EXISTS "recruitment_application_profile_org_idx" ON "recruitment_application_profile" USING btree ("organization_id");
CREATE INDEX IF NOT EXISTS "recruitment_application_profile_fit_idx" ON "recruitment_application_profile" USING btree ("organization_id", "current_fit");
CREATE INDEX IF NOT EXISTS "recruitment_application_profile_status_idx" ON "recruitment_application_profile" USING btree ("organization_id", "last_status");

CREATE TABLE IF NOT EXISTS "recruitment_evidence" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "application_id" text NOT NULL REFERENCES "application"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "summary" text,
  "payload" jsonb,
  "created_by" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "recruitment_evidence_org_idx" ON "recruitment_evidence" USING btree ("organization_id");
CREATE INDEX IF NOT EXISTS "recruitment_evidence_application_idx" ON "recruitment_evidence" USING btree ("application_id");
CREATE INDEX IF NOT EXISTS "recruitment_evidence_type_idx" ON "recruitment_evidence" USING btree ("application_id", "type");

CREATE TABLE IF NOT EXISTS "recruiter_screening_session" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "application_id" text NOT NULL REFERENCES "application"("id") ON DELETE CASCADE,
  "status" text DEFAULT 'not_started' NOT NULL,
  "questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "responses" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "final_fit" text,
  "recommended_next_step" text,
  "validation_focus" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "started_at" timestamp,
  "completed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "recruiter_screening_session_app_idx" ON "recruiter_screening_session" USING btree ("application_id");
CREATE INDEX IF NOT EXISTS "recruiter_screening_session_org_idx" ON "recruiter_screening_session" USING btree ("organization_id");

-- Existing Reqcore applications need a PDS profile so the governed workflow can be used immediately.
-- Current Fit remains Not Yet Assessed because legacy coarse stages are not evidence of fit.
INSERT INTO "recruitment_application_profile" (
  "id", "organization_id", "application_id", "current_fit", "last_status", "status_date", "next_action", "assessment_locked"
)
SELECT
  'pds-profile-' || a."id",
  a."organization_id",
  a."id",
  'not_yet_assessed',
  CASE
    WHEN a."status" = 'screening' THEN 'recruiter_screening_pending'
    WHEN a."status" = 'interview' THEN 'hod_round_pending'
    WHEN a."status" = 'offer' THEN 'offer_stage'
    WHEN a."status" = 'hired' THEN 'joined'
    WHEN a."status" = 'rejected' THEN 'not_proceeding'
    WHEN EXISTS (
      SELECT 1 FROM "document" d
      WHERE d."organization_id" = a."organization_id"
        AND d."candidate_id" = a."candidate_id"
        AND d."type" = 'resume'
    ) THEN 'resume_received'
    ELSE 'candidate_added'
  END,
  COALESCE(a."updated_at", a."created_at", now()),
  CASE
    WHEN a."status" = 'screening' THEN 'Continue recruiter screening or confirm the appropriate PDS stage.'
    WHEN a."status" = 'interview' THEN 'Record HOD/interview evidence or confirm the appropriate PDS stage.'
    WHEN a."status" = 'offer' THEN 'Continue offer-stage actions.'
    WHEN a."status" = 'hired' THEN 'Confirm closure when appropriate.'
    WHEN a."status" = 'rejected' THEN 'Review only if reassessment is required.'
    WHEN EXISTS (
      SELECT 1 FROM "document" d
      WHERE d."organization_id" = a."organization_id"
        AND d."candidate_id" = a."candidate_id"
        AND d."type" = 'resume'
    ) THEN 'Complete resume assessment against the approved requirement baseline.'
    ELSE 'Upload or verify the latest resume.'
  END,
  false
FROM "application" a
ON CONFLICT ("application_id") DO NOTHING;
