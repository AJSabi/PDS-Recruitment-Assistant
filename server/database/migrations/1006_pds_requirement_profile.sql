ALTER TABLE "recruitment_requirement_state"
ADD COLUMN IF NOT EXISTS "requirement_profile" jsonb DEFAULT '{}'::jsonb NOT NULL;
