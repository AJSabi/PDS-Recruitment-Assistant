# Test Credentials — Reqcore (PDS-Recruitment-Assistant)

## Demo application login
- URL: https://4bf5e0b6-6f46-42da-82d9-79d365c36743.preview.emergentagent.com/auth/sign-in
- Email: `demo@reqcore.com`
- Password: `demo1234`
- Organization: `Reqcore Demo` (auto-selected after login)

Re-seed anytime with: `cd /app && set -a; . ./.env; set +a; npm run db:reseed`

## Pod-local infrastructure (no external credentials)
- PostgreSQL: `postgresql://reqcore:reqcore_local_pass@127.0.0.1:5432/reqcore` (PGDATA persisted at `/app/.data/postgres`)
- MinIO (S3): endpoint `http://127.0.0.1:9000`, key `reqcore` / `reqcore_local_pass`, bucket `reqcore`, console `:9001` (data at `/app/.data/minio`)
- BETTER_AUTH_SECRET: set in `/app/.env`
