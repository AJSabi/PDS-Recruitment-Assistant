ALTER TABLE "recruitment_application_profile"
ADD COLUMN IF NOT EXISTS "ai_candidate_summary" text,
ADD COLUMN IF NOT EXISTS "ai_overall_assessment" text,
ADD COLUMN IF NOT EXISTS "ai_interview_briefs" jsonb DEFAULT '[]'::jsonb NOT NULL,
ADD COLUMN IF NOT EXISTS "ai_final_brief" text,
ADD COLUMN IF NOT EXISTS "ai_evidence_confidence" text,
ADD COLUMN IF NOT EXISTS "ai_summary_stale" boolean DEFAULT true NOT NULL,
ADD COLUMN IF NOT EXISTS "ai_summary_updated_at" timestamp;
