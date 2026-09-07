ALTER TABLE "recruitment_application_profile"
ADD COLUMN IF NOT EXISTS "notes" text;

ALTER TABLE "recruiter_screening_session"
ADD COLUMN IF NOT EXISTS "skill_matrix_version" integer DEFAULT 1 NOT NULL;

ALTER TABLE "recruiter_screening_session"
ADD COLUMN IF NOT EXISTS "recruiter_notes" text;

ALTER TABLE "recruiter_screening_session"
ADD COLUMN IF NOT EXISTS "recommendation" text;

ALTER TABLE "recruiter_screening_session"
ADD COLUMN IF NOT EXISTS "created_by" text REFERENCES "user"("id") ON DELETE SET NULL;

ALTER TABLE "recruitment_evidence"
ADD COLUMN IF NOT EXISTS "job_id" text REFERENCES "job"("id") ON DELETE CASCADE;

ALTER TABLE "recruitment_evidence"
ADD COLUMN IF NOT EXISTS "candidate_id" text REFERENCES "candidate"("id") ON DELETE CASCADE;

ALTER TABLE "recruitment_evidence"
ADD COLUMN IF NOT EXISTS "source_ref" text;

CREATE INDEX IF NOT EXISTS "recruitment_evidence_candidate_idx"
ON "recruitment_evidence" USING btree ("candidate_id");

CREATE INDEX IF NOT EXISTS "recruitment_evidence_job_idx"
ON "recruitment_evidence" USING btree ("job_id");

CREATE TABLE IF NOT EXISTS "recruitment_skill_assessment" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "application_id" text NOT NULL REFERENCES "application"("id") ON DELETE CASCADE,
  "skill_matrix_version" integer DEFAULT 1 NOT NULL,
  "items" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "current_fit" text DEFAULT 'not_yet_assessed' NOT NULL,
  "summary" text,
  "created_by" text REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "recruitment_skill_assessment_application_idx"
ON "recruitment_skill_assessment" USING btree ("application_id");

CREATE INDEX IF NOT EXISTS "recruitment_skill_assessment_org_idx"
ON "recruitment_skill_assessment" USING btree ("organization_id");
