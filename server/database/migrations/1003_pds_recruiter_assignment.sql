ALTER TABLE "recruitment_requirement_state"
ADD COLUMN IF NOT EXISTS "owner_user_id" text;

ALTER TABLE "recruitment_application_profile"
ADD COLUMN IF NOT EXISTS "assigned_recruiter_id" text;

DO $$ BEGIN
  ALTER TABLE "recruitment_requirement_state"
  ADD CONSTRAINT "recruitment_requirement_state_owner_user_id_user_id_fk"
  FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id")
  ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "recruitment_application_profile"
  ADD CONSTRAINT "recruitment_application_profile_assigned_recruiter_id_user_id_fk"
  FOREIGN KEY ("assigned_recruiter_id") REFERENCES "public"."user"("id")
  ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "recruitment_requirement_state_owner_idx"
ON "recruitment_requirement_state" USING btree ("organization_id", "owner_user_id");

CREATE INDEX IF NOT EXISTS "recruitment_application_profile_recruiter_idx"
ON "recruitment_application_profile" USING btree ("organization_id", "assigned_recruiter_id");
