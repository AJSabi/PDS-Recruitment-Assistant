# Reqcore (PDS-Recruitment-Assistant) — Emergent bring-up

## Original task
Import & inspect the GitHub repo `AJSabi/PDS-Recruitment-Assistant` as-is, confirm whether it can
run in Emergent without code changes, identify minimum changes, then get it running with minimum fixes.
No redesign / rename / refactor / new features.

## What the app is
Reqcore v1.5.0 — open-source Applicant Tracking System (ATS). **Nuxt 4 (Vue 3, Nitro)** full-stack SSR app.
Not the default React/FastAPI/Mongo stack.

## Stack & requirements (inspection findings)
- Framework: Nuxt 4.4 / Nitro node-server, single Node process on port 3000 serving UI + `/api/*`.
- DB: **PostgreSQL** via Drizzle ORM (`postgres` driver). Schema in `server/database/schema`. NOT MongoDB.
- Storage: **S3-compatible** (MinIO) via `@aws-sdk/client-s3`. Mandatory to boot (env validated).
- Auth: **better-auth** (email/pw, social OAuth, OIDC SSO). Strict Origin/CSRF check.
- AI: Vercel AI SDK (`@ai-sdk/openai|anthropic|google`) — provider keys configured **per-org in the app UI**,
  encrypted in DB. Supports an `openai_compatible` provider with custom base URL.
- Email: Nodemailer/SMTP or Resend; defaults to console logging.
- Deploy target upstream: Docker / Railway (Postgres + MinIO + app).
- Package manager: npm (`package-lock.json`, `npm ci`). Node 22 expected; runs on pod's Node 20 (benign AWS-SDK warning).

## Verdict: CANNOT run as-is in Emergent. Minimum fixes applied (infra/config, no app redesign):
1. Provisioned pod-local PostgreSQL 15, PGDATA relocated to `/app/.data/postgres` (persistent). Role/db `reqcore`.
2. Provisioned pod-local MinIO; binary at `/app/.tools/minio`, data at `/app/.data/minio`, bucket `reqcore`.
3. Created `/app/.env` (DATABASE_URL, BETTER_AUTH_SECRET/URL + trusted origins, S3_*, site URL).
4. Ran `db:migrate` + `db:seed` (demo org + data).
5. Built the Nuxt production bundle (`.output`).
6. Fitted the fixed Emergent supervisor model:
   - `/app/frontend/package.json` -> runs **`nuxt dev` on port 3000** for hot-reload (loads `/app/.env` from cwd). (Was: built `.output` server; switched to dev mode on 2026-08-21.)
   - `/app/backend/server.py` -> FastAPI reverse proxy on 8001 that forwards `/api/*` to Nuxt:3000
     (streams SSE). Also **rewrites Origin/Host/Referer to the public host** because Cloudflare ingress
     rewrites Origin to an internal `*.emergentcf.cloud` domain, which broke better-auth's origin check.
   - `/etc/supervisor/conf.d/reqcore-infra.conf` -> supervises postgres + minio.

## Status (2026-08-21) — RUNNING & verified live
- Login (demo@reqcore.com/demo1234) works end-to-end through the ingress; dashboard renders seeded data
  (4 open jobs, 30 candidates, 57 applications, pipelines, interviews).
- DB, S3 bucket, auth sessions all confirmed working.

## Known limitations / notes
- **AI not wired to Emergent Universal key.** That key is only exposed via the Python `emergentintegrations`
  library — there is no OpenAI-compatible HTTP base URL to plug into this app's Vercel AI SDK. To use it we
  must build a small OpenAI-compatible shim on the backend, or the user enters their own OpenAI/Anthropic/
  Gemini key in the app UI (Settings -> AI). Core ATS works fully without AI.
- Pod-local data lives under `/app/.data` (persists across normal restarts). A full pod rebuild wipes
  apt packages (`postgres` binaries) and `/usr/local`; re-run provisioning if that happens. User accepted this.
- Email uses console-log default (no provider configured).

## Backlog / next actions
- P1: Wire AI via Emergent key (build OpenAI-compatible shim) OR document per-org key entry.
- P2: Optional social login / OIDC SSO / Resend email if the user provides keys.
- P2: Switch frontend to `nuxt dev` if live code iteration is desired (currently production build).
