ALTER TABLE "recruitment_application_profile"
ADD COLUMN IF NOT EXISTS "selected_resume_document_id" text;

DO $$ BEGIN
  ALTER TABLE "recruitment_application_profile"
  ADD CONSTRAINT "recruitment_application_profile_selected_resume_document_id_document_id_fk"
  FOREIGN KEY ("selected_resume_document_id") REFERENCES "public"."document"("id")
  ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "recruitment_application_profile_resume_idx"
ON "recruitment_application_profile" USING btree ("selected_resume_document_id");
