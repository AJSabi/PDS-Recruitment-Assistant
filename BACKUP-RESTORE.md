# Database Backup and Restore Runbook

## Purpose

This runbook defines the recovery procedure for PDS Recruitment Assistant database changes and self-hosted updates. Database restore is deliberately manual. The application must never automatically replace production data after a failed deployment.

## Backup location

Self-hosted Docker backups are written only to `/data/backups`, which is backed by the `backups_data` Docker volume. The application does not fall back to `/tmp` for update backups because `/tmp` is ephemeral and may disappear on container restart.

The owner-only backup endpoint and the self-hosted one-click updater both use PostgreSQL `pg_dump`. A successful backup must be non-empty.

## Before a self-hosted update

The one-click update sequence is:

1. Verify Docker, Git and `pg_dump` are available.
2. Create a durable database backup in `/data/backups`.
3. Abort immediately if the backup fails.
4. Pull application code.
5. Rebuild and restart the application container.

The update process must not automatically run a database restore.

## Manual backup verification

From the Docker host:

```sh
docker compose exec app sh -lc 'ls -lh /data/backups'
```

Confirm that the latest `reqcore-backup-*.sql` file exists and has a non-zero size.

For an independent database dump:

```sh
docker compose exec db pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --no-acl > pds-manual-backup.sql
```

Store independent production backups outside the application host according to the organisation's backup policy. The Docker volume alone is not protection against host loss.

## Restore procedure

Restore must be performed only by an authorised operator during a controlled maintenance window.

1. Stop application traffic or put the application into maintenance mode.
2. Take a final backup of the current database if it is still reachable.
3. Identify the exact backup and application version to restore.
4. Restore into a temporary/staging database first whenever practical and verify the dump is readable.
5. Restore production only after the recovery point is confirmed.
6. Start the application version compatible with the restored schema.
7. Run smoke checks for authentication, organisation access, jobs, candidates, applications, allocations and recruitment workflow visibility.
8. Record the restore time, backup filename, operator and reason.

For a plain SQL backup created by the application, the core PostgreSQL restore command is:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f /path/to/reqcore-backup.sql
```

Do not run this command against production until the target database and backup have been positively verified.

## Migration recovery policy

Drizzle migrations are forward-only release artifacts. Do not edit or delete already-applied migration files to recover from a failed release. If a schema change must be reversed, prefer a new corrective migration after assessing data compatibility.

If a deployment fails after migrations have applied, choose between:

- rolling the application forward with a corrective release; or
- restoring the database and the matching prior application version during a controlled recovery.

Never use `db:push`, `db:seed`, or `db:reseed` as an automated recovery mechanism in production.

## Production deployment notes

Railway deployment runs production preflight checks followed by `db:migrate`. Demo seeding is not part of deployment. Railway-managed database backups/snapshots should be configured separately at the platform level where available.

## Recovery validation checklist

After any restore, verify at minimum:

- authentication and session creation;
- owner/admin organisation-wide visibility;
- recruiter allocation-based requirement visibility;
- candidate and application linkage;
- recruitment stage history and TAT assignment dates;
- uploaded resume/object-storage references;
- analytics endpoints can read persisted telemetry;
- no demo seed data has been introduced into production;
- latest migrations and application version are mutually compatible.
