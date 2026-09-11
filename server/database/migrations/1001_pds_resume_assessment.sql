CREATE TABLE IF NOT EXISTS "resume_assessment" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "application_id" text NOT NULL,
  "candidate_snapshot" text,
  "jd_alignment" text,
  "skill_assessment" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "key_gaps" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "verification_areas" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "mandatory_score" integer,
  "preferred_score" integer,
  "experience_score" integer,
  "optional_score" integer,
  "provisional_fit_score" integer,
  "mandatory_match" text,
  "key_strength" text,
  "main_gap" text,
  "priority" text,
  "requirement_version" integer DEFAULT 0 NOT NULL,
  "source" text DEFAULT 'manual' NOT NULL,
  "assessed_by" text,
  "assessed_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "resume_assessment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "resume_assessment_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE cascade ON UPDATE no action
);
CREATE UNIQUE INDEX IF NOT EXISTS "resume_assessment_app_idx" ON "resume_assessment" USING btree ("application_id");
CREATE INDEX IF NOT EXISTS "resume_assessment_org_idx" ON "resume_assessment" USING btree ("organization_id");
CREATE INDEX IF NOT EXISTS "resume_assessment_priority_idx" ON "resume_assessment" USING btree ("organization_id", "priority");
