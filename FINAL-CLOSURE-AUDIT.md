# PDS Recruitment Assistant — Final Product Closure Audit

## Release status

This document is the final core-product closure checklist for the PDS Recruitment Assistant. It does not replace exact-SHA CI validation or browser UAT.

A production candidate is GO only when the exact release SHA completes PDS Validation successfully and the deployment/UAT checks below are satisfied.

## Release gates

The exact release SHA must pass:

1. Clean dependency installation with Node 22 / validated npm resolver.
2. Production release preflight.
3. Better Auth security peer graph inspection.
4. Dependency security audit with total vulnerabilities = 0.
5. Typecheck.
6. Full unit/regression suite.
7. Production build.
8. Deployment smoke checks after release.

## Critical recruitment invariants

### Access and allocation

- Owner/admin may view organisation-wide recruitment operations.
- Recruiters may only work on allocated requirements/application workflows.
- Candidate Database remains a central shared candidate repository, while requirement/application workflow visibility stays allocation-governed.
- Management analytics are descriptive and owner/admin-only; they do not rank candidates or make hiring decisions.

### TAT

- Recruiter allocation date starts requirement TAT.
- An unallocated requirement has no TAT.
- Requirement creation date must never be used as a fallback TAT start date.

### Candidate identity and duplicate handling

Duplicate/reapplication behavior must remain:

`existing candidate -> retain Candidate ID -> add new resume as an additional document -> preserve old resumes/history -> review changed identity -> create/link new application`

- Duplicate check uses canonical email first, phone second.
- Do not create a second Candidate record for the same confirmed person.
- Parsed resume identity never silently overwrites Candidate master identity.
- Changed email/phone/designation/employer/location/experience/skills require recruiter review where relevant.
- Single-name candidates remain supported.

### Resume/document history

- New resumes are additional documents, not replacements.
- Prior resumes, applications, screenings, assessments, evidence and documents remain intact.
- Supported resume/document intake remains PDF/DOC/DOCX with the enforced upload/text limits.

### Recruitment workflow

- Recruitment progression uses the governed PDS recruitment lifecycle.
- Legacy generic ATS status controls must not be reintroduced into the primary recruiter flow.
- Stage history/evidence remains the source for recruitment movement and stage-age analytics.
- AI output is advisory evidence for recruiter judgment; it does not auto-select or auto-reject candidates.

### Recruiter/TA/Management analytics

- Recruiter Daily Recruitment Pulse uses persisted activity evidence and immutable sourcing attribution for new telemetry.
- TA Operations is operational/team-oriented and must not become an automated recruiter leaderboard.
- Management Recruitment Analytics remains outcome-oriented and descriptive.
- Conversion metrics must come from persisted historical evidence rather than inferred snapshot ratios.

### Retention and quarantine

- Quarantined candidates remain blocked from recruiter-driven mutation/revival.
- A candidate's own new public application may atomically restore the existing Candidate ID as fresh engagement.
- Historical reads remain available where required for audit/evidence.
- Hard erasure remains centralized and purge eligibility is guarded.

## UI/UAT checklist

Validate with representative Owner/Admin and Recruiter accounts:

1. Sign in and organisation context load correctly.
2. Recruiter Command Centre shows only allocated recruitment scope.
3. Recruiter Daily Recruitment Pulse shows previous-weekday activity and 30-day daily run-rate.
4. TA Operations is available only to authorised management roles.
5. Management Recruitment Analytics is available only to authorised management roles.
6. Requisition list opens the Requirement Command Centre.
7. Requirement Overview links correctly to Team Allocation, Candidate Pipeline, JD & Skill Matrix, Candidate Match, Sourcing Toolkit, Candidate Register and Requisition Settings.
8. Unallocated requirement displays `TAT not started` and no calculated TAT value.
9. Candidate Pipeline groups candidates by governed PDS recruitment stage and opens the Recruiter Candidate Workspace.
10. Recruiter Candidate Workspace supports resume assessment, screening, interviews/evidence, notes, documents and journey/history without generic status mutation.
11. Candidate Database is usable on desktop and mobile layouts and opens requirement-specific Recruitment Workspaces correctly.
12. Duplicate candidate reapplication retains the Candidate ID, preserves previous resume(s), adds the new resume and creates/links the new application.
13. Resume identity conflicts require review rather than silent Candidate-master overwrite.
14. Quarantined candidate cannot be revived by recruiter mutation.
15. Candidate self-reapplication restoration behaves atomically.
16. Public application failure for a required document does not leave a partial application.
17. Cross-organisation IDs cannot be used to read or mutate another organisation's data.

## Deployment/operations checklist

Follow `DEPLOYMENT-RUNBOOK.md` and `BACKUP-RESTORE.md`.

- Run production preflight against the intended production configuration.
- Back up the intended production database before schema/data migration.
- Run `npm run deploy:migrate` once as a deployment/pre-deploy operation.
- Do not run database migrations independently from every application replica.
- Application startup remains migration-free.
- Until shared/distributed rate limiting is deliberately implemented, production must remain at one application replica; multi-replica production is expected to fail closed.
- Readiness endpoint: `/api/_health/ready`.
- Liveness endpoint: `/api/_health/live`.
- Verify auth/org context, recruiter allocation visibility, candidate document upload/download, public application where enabled, database readiness and application logs after deployment.

## Known limitations / accepted closure items

These are disclosed limitations, not hidden completion claims:

1. **Browser E2E coverage:** Critical journeys are strongly protected by unit/static regression tests, but a full Playwright browser E2E suite has not yet been implemented. This is the recommended final production-assurance workstream.
2. **Rate limiting:** Rate limiting is process-local. Production is intentionally constrained to one replica until a shared/edge limiter is implemented.
3. **Recruiter working-day KPI:** Previous working day currently means previous weekday; it is not yet PDS holiday-calendar aware.
4. **Retention purge race:** A documented small race remains in which prior S3 objects could be deleted before the database transaction detects a fresh candidate reapplication during erasure. Do not claim this race is eliminated.
5. **Management dimensions:** Department/location management analytics remain deferred until those dimensions are consistently persisted/governed across requisitions.
6. **Legacy compatibility surfaces:** Some inherited pages/components remain in the repository for compatibility. Primary recruitment navigation must not route users back into legacy generic ATS status workflows.
7. **Hosting platform:** Railway-compatible deployment support exists, but this does not constitute a PDS decision to use Railway as the production hosting platform.

## Go / no-go rule

### GO for controlled UAT/internal pilot

GO when:

- exact release SHA is fully green in PDS Validation;
- production configuration/preflight is clean;
- database backup/migration plan is confirmed;
- one-replica deployment constraint is respected;
- role/access, TAT, duplicate/resume-history and retention UAT checks pass.

### NO-GO

Do not release when any of the following is true:

- exact release SHA is not fully green;
- dependency audit reports any vulnerability;
- recruiter can access another recruiter's unallocated requirement workflow;
- TAT starts before allocation;
- duplicate resolution can overwrite prior resume/history or silently overwrite candidate identity;
- retention/quarantine controls can be bypassed;
- production is horizontally scaled while the process-local limiter remains in use;
- migration/backup readiness is unresolved.

## Recommended final assurance

After core product closure, add Playwright browser E2E coverage for the highest-risk journeys: recruiter isolation, allocation/TAT, cross-org IDOR, duplicate reapplication/resume preservation, public-application transaction rollback, retention restore/denial, and owner/admin analytics access.
