CREATE TABLE IF NOT EXISTS "talent_pool_match" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "job_id" text NOT NULL,
  "candidate_id" text NOT NULL,
  "resume_document_id" text,
  "requirement_version" integer DEFAULT 0 NOT NULL,
  "score" integer,
  "priority" text,
  "mandatory_match" text,
  "key_strength" text,
  "main_gap" text,
  "candidate_snapshot" text,
  "jd_alignment" text,
  "skill_assessment" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "key_gaps" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "verification_areas" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "source" text DEFAULT 'database' NOT NULL,
  "promoted_application_id" text,
  "assessed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "talent_pool_match" ADD CONSTRAINT "talent_pool_match_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
 ALTER TABLE "talent_pool_match" ADD CONSTRAINT "talent_pool_match_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "job"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
 ALTER TABLE "talent_pool_match" ADD CONSTRAINT "talent_pool_match_candidate_id_candidate_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "candidate"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
 ALTER TABLE "talent_pool_match" ADD CONSTRAINT "talent_pool_match_resume_document_id_document_id_fk" FOREIGN KEY ("resume_document_id") REFERENCES "document"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
 ALTER TABLE "talent_pool_match" ADD CONSTRAINT "talent_pool_match_promoted_application_id_application_id_fk" FOREIGN KEY ("promoted_application_id") REFERENCES "application"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "talent_pool_match_job_candidate_idx"
ON "talent_pool_match" USING btree ("organization_id", "job_id", "candidate_id");
CREATE INDEX IF NOT EXISTS "talent_pool_match_job_score_idx"
ON "talent_pool_match" USING btree ("organization_id", "job_id", "score");
CREATE INDEX IF NOT EXISTS "talent_pool_match_candidate_idx"
ON "talent_pool_match" USING btree ("organization_id", "candidate_id");
CREATE INDEX IF NOT EXISTS "talent_pool_match_resume_idx"
ON "talent_pool_match" USING btree ("resume_document_id");
