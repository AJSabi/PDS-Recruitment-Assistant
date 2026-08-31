ALTER TABLE "job_skill_matrix" ADD COLUMN IF NOT EXISTS "major_skills" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "job_skill_matrix" ADD COLUMN IF NOT EXISTS "boolean_search" text;
ALTER TABLE "job_skill_matrix" ADD COLUMN IF NOT EXISTS "boolean_search_feedback" text;
ALTER TABLE "job_skill_matrix" ADD COLUMN IF NOT EXISTS "sourcing_generated_at" timestamp;
ALTER TABLE "job_skill_matrix" ADD COLUMN IF NOT EXISTS "sourcing_updated_by" text;
