ALTER TABLE "recruitment_requirement_state"
ADD COLUMN IF NOT EXISTS "assignment_date" timestamp,
ADD COLUMN IF NOT EXISTS "target_closure_date" timestamp,
ADD COLUMN IF NOT EXISTS "closed_at" timestamp;

CREATE INDEX IF NOT EXISTS "recruitment_requirement_state_target_idx"
ON "recruitment_requirement_state" USING btree ("organization_id", "target_closure_date");
