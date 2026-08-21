CREATE TABLE IF NOT EXISTS "job_skill_matrix" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "job_id" text NOT NULL,
  "matrix" jsonb NOT NULL,
  "approved_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "job_skill_matrix_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade,
  CONSTRAINT "job_skill_matrix_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE cascade
);
CREATE UNIQUE INDEX IF NOT EXISTS "job_skill_matrix_job_idx" ON "job_skill_matrix" USING btree ("job_id");
CREATE INDEX IF NOT EXISTS "job_skill_matrix_org_idx" ON "job_skill_matrix" USING btree ("organization_id");
