# PDS Recruitment Assistant Production Deployment Runbook

This runbook defines the minimum production deployment and operating controls for the PDS Recruitment Assistant. It complements `BACKUP-RESTORE.md`, `DATA-RETENTION.md`, and `.env.example`.

## 1. Release gate

Deploy only an exact commit that has passed the PDS Validation workflow: release preflight, Better Auth dependency inspection, zero-vulnerability npm audit, typecheck, unit tests, and production build.

Before changing production, record the exact Git commit SHA being deployed.

## 2. Production configuration

Run `npm run release:preflight` against the production environment before migration or application startup.

Production requires valid database, Better Auth, and private S3 configuration. An outbound email provider is required. If automated retention is enabled, `CRON_SECRET` is also required.

Do not use placeholder credentials. Production authentication must use HTTPS.

The S3 bucket must remain private. Candidate documents are served through authenticated application endpoints; do not enable public bucket/object access.

## 3. Replica limit

Run one application replica only while the public application/chatbot rate limiter remains process-local.

Do not horizontally scale the service until those limiters use shared storage such as Redis or an equivalent centralized rate-limit backend. `release:preflight` is expected to reject a known multi-replica Railway configuration.

## 4. Database backup and migration

Before any production migration that changes schema or data:

1. Create and verify a database backup using `BACKUP-RESTORE.md`.
2. Confirm the backup belongs to the intended production database.
3. Run migrations once as a deployment/pre-deploy operation with `npm run deploy:migrate`.
4. Do not run migrations independently from every application replica.
5. Start the application only after the migration command succeeds.

`npm run start:railway` starts the built application only; it intentionally does not migrate the database.

Database rollback is not assumed to be safe. If a migration has no tested down path, prefer application rollback/forward correction. Use a verified backup restore only under the recovery procedure in `BACKUP-RESTORE.md`.

## 5. Railway service settings

Recommended production settings:

- Pre-deploy command: `npm run deploy:migrate`
- Start command: `npm run start:railway` or the Docker image default command
- Readiness/health check path: `/api/_health/ready`
- Application replicas: `1`
- Restart policy: platform default unless an incident-specific change is approved

`/api/_health/live` is a dependency-free process liveness endpoint. `/api/_health/ready` checks database connectivity and returns HTTP 503 when the application should not receive traffic.

Do not use the liveness endpoint as the traffic-readiness check because it intentionally remains successful during a database outage.

## 6. Post-deployment verification

After deployment:

1. Confirm `/api/_health/live` returns HTTP 200.
2. Confirm `/api/_health/ready` returns HTTP 200 and reports database `ok`.
3. Confirm sign-in and organization access.
4. Verify an allocated recruiter can access an allocated requirement and cannot access another recruiter's unallocated requirement.
5. Verify a candidate resume can be uploaded and later downloaded through the authenticated document endpoint.
6. Verify one non-destructive public job application flow in the intended environment where operationally appropriate.
7. Review application logs for authentication, database, S3, email, and migration errors.

Do not use real candidate PII for synthetic deployment checks unless the test is part of an approved production process.

## 7. Retention operations

Automated candidate retention remains fail-closed unless `GDPR_CLEANUP_ENABLED=true` and the organization-level retention control is enabled.

If retention cleanup is enabled:

- configure `CRON_SECRET`;
- use the authenticated retention-cleanup endpoint/schedule documented in `DATA-RETENTION.md`;
- verify quarantine before purge;
- review retention audit results;
- use the instance-wide cleanup switch as the emergency pause if unexpected retention behavior is observed.

## 8. Monitoring and incident response

Alert on, at minimum:

- readiness failures;
- repeated application 5xx responses;
- authentication/SSO failures;
- database connection failures;
- S3 upload/download/cleanup failures;
- retention purge or audit failures;
- repeated migration failures.

Logs must not intentionally include raw resume text, authentication secrets, S3 credentials, access tokens, or unnecessary candidate PII.

If readiness fails, remove the deployment from traffic before treating a successful liveness response as service recovery.

## 9. Rollback

For an application-only defect with compatible schema, redeploy the last validated application commit.

If the new release included a database migration, first determine whether the previous application version is compatible with the migrated schema. Do not blindly restore or reverse migrations.

For destructive or incompatible database incidents, follow the verified restore procedure in `BACKUP-RESTORE.md` and preserve incident evidence before recovery where practical.

## 10. Production deployment checklist

A production release is ready only when all of the following are true:

- exact release SHA has a green PDS Validation run;
- production release preflight passes;
- production environment variables are configured and non-placeholder;
- HTTPS authentication URL is correct;
- private S3 access is configured;
- outbound email provider is configured;
- database backup is current and restorable;
- migration is executed once through the deployment/pre-deploy step;
- application starts without running migrations itself;
- readiness endpoint is the platform traffic health check;
- replica count is one while rate limiting is process-local;
- retention scheduling/secret is configured if cleanup is enabled;
- post-deployment smoke checks pass;
- rollback target SHA and database recovery procedure are known.
