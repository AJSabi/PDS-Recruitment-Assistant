# PDS Recruitment Assistant - Full Application Audit

Audit type: Static code and architecture audit
Branch: feature/pds-skill-matrix
Runtime validation: Deferred until consolidated Emergent sync

## 1. Executive status

The application has moved substantially away from the original generic ATS structure and now has a coherent PDS recruitment model:

New Requirement -> JD / Requirement Profile -> AI Skill Matrix -> AI Candidate Pool -> Move to Recruitment -> Recruiter Screening -> Hiring Manager -> HOD -> HR -> Offer.

The static audit identified three main classes of risk:

1. Legacy Reqcore routes that remained organization-wide even after recruiter allocation was introduced.
2. PDS workflow endpoints that were permission-protected but did not consistently enforce requirement ownership.
3. UI and administrative surfaces that still expose generic ATS concepts or organization-level controls more broadly than the intended PDS operating model.

Critical job-level allocation bypasses found during the audit have been fixed. Additional application-child routes remain on the closure list below and should be completed before the consolidated runtime test.

## 2. Authorization and data visibility

### Fixed

- Recruiters see only requirements allocated through recruitment_requirement_state.owner_user_id.
- Owner/Admin users retain organization-wide requirement visibility.
- Main Requirements listing is allocation-scoped server-side.
- Main requirement lookup is allocation-scoped server-side.
- Dashboard metrics and candidate movement are allocation-scoped for recruiters.
- Candidate Register is protected by requirement allocation.
- Requirement Profile read/write is protected by allocation.
- Skill Matrix read/write/approval and AI generation are protected by allocation.
- AI Candidate Pool listing, sync and direct resume upload are protected by allocation.
- Move to Recruitment is protected by allocation.
- JD generation and requirement mutation are protected by allocation.
- Candidate intake and batch analysis are protected by allocation.
- Legacy application list/detail/create/update routes are now allocation-scoped.
- Legacy interview list/create routes are now allocation-scoped.
- Candidate Journey/history and confirmed stage movement are allocation-scoped.
- Organization-wide AI usage/cost statistics are restricted to recruitment Admin/Owner.
- New Requirement and requirement deletion are restricted to recruitment Admin/Owner at the API layer, not merely hidden in the UI.
- Manual per-candidate recruiter reassignment is restricted to recruitment Admin/Owner.
- Candidate recruitment ownership now inherits the requirement owner when a candidate is promoted from the AI Candidate Pool or added through manual intake.
- Job/application comments are being brought under allocation visibility while candidate-level comments remain organization-wide because the Candidate Database is intentionally shared.

### Still to harden before runtime validation

Application-child endpoints must all use the same assertApplicationAccess rule. Priority review set:

- resume-assessment: get, manual save, AI generate
- screening: get, generate, start, answer, interpret, complete
- selected resume endpoints
- reassessment endpoint
- recruitment-profile endpoints
- evidence and interview-evidence endpoints
- custom application properties and legacy score endpoints
- legacy application AI analyze endpoint

Legacy interview detail/update/delete/send-invitation routes must use assertInterviewAccess.

Comment create/edit/delete routes must enforce allocation access for job/application targets while preserving shared candidate comments.

Activity-log APIs should be reviewed for recruiter scope or made Admin/Owner-only if they expose organization-wide activity.

## 3. Requirement allocation model

### Current governed model

- Requirement owner is the primary recruiter allocation field.
- Recruiters can see only their allocated requirements.
- Admin/Owner can see all requirements.
- Candidate applications created under a requirement inherit that requirement owner.
- Requirement allocation management is Admin/Owner-only.
- Assignment Date and Target Closure Date are managed with a default 60-day closure target.

### Remaining consistency check

When a requirement is reassigned, existing recruitment_application_profile.assigned_recruiter_id records should be synchronized to the new requirement owner. The allocation API should perform this cascade or the application UI should stop treating assignedRecruiterId as an independent ownership field.

## 4. AI Candidate Pool and cost controls

### Fixed

- Historical candidate search uses a lightweight skill-term prefilter before full AI analysis.
- Full AI analysis is capped at 30 attempts per Candidate Pool refresh.
- Candidates below 50% are hidden from recruiter ranking rather than rejected or deleted from the Candidate Database.
- Current resume + current requirement revision matches are not re-analysed.
- Full AI assessments below 50% are now retained as hidden cache records, preventing repeated AI spend on unchanged resumes during later pool refreshes.
- Direct JD resume uploads remain immediate full AI assessments by design.
- Promotion into Recruitment reuses the existing AI assessment rather than running resume analysis again.
- Screening-question failure does not block promotion.
- AI provider errors are centrally normalized into recruiter-readable messages.

### Still to improve

- Direct JD resume uploads that score below 50% should also preserve the hidden assessment cache instead of deleting the match row. This prevents a later database refresh from paying for the same assessment again.
- Candidate Pool UI should display deferredForAiBudget when more plausible candidates remain for a later refresh.
- Consider a small Admin-only AI usage panel showing analysis attempts/tokens/cost once PDS-specific usage logging is confirmed.
- Verify that all PDS AI calls are included in analysis usage logging; the legacy analysisRun reporting path may not automatically cover every new PDS structured-generation call.

## 5. Recruitment workflow integrity

### Working model

Recruiter Screening -> Hiring Manager Pending -> Hiring Manager Completed -> HOD Pending -> HOD Completed -> HR Pending -> HR Completed -> Offer.

- UI exposes one normal next step at a time.
- Backend validates confirmed stage transitions.
- Resume and recruiter-screening stages remain evidence-driven.
- Hiring Manager, HOD and HR interviews are external in V1 and stage movement is manual.
- Hold for Comparison, Reassess and Not Proceeding are separate exception decisions.
- Candidate Journey presents recruiter-readable milestones while preserving underlying evidence.

### Remaining review

- Confirm every screening mutation endpoint is allocation-scoped.
- Confirm Hold/Reassess/Not Proceeding endpoints cannot be called for another recruiter's application.
- Ensure Offer Accepted/Declined endpoints follow the same access rule.
- Decide whether candidate-level recruiter assignment should remain visible in the UI now that requirement ownership is authoritative.

## 6. Candidate Database

### Intended behavior

The Candidate Database is an organization-wide talent database and is intentionally different from requirement visibility.

A recruiter may search the shared candidate database, but should only see recruitment/application detail for requirements they are allowed to access.

### Review point

Candidate detail endpoints can remain organization-wide for profile/resume reuse, but nested application history must not reveal another recruiter's restricted requirement details. Candidate history responses should be filtered or summarized when they contain applications outside the current user's visible requirement set.

## 7. Administrative surfaces and Settings

### Current concern

The top navigation still exposes the generic Settings entry to recruiters. The settings area contains account settings as well as organization-level modules such as AI configuration, members, SSO, retention and integrations.

### Recommended closure

- Admin/Owner: show full Settings.
- Recruiter: show My Account only.
- Add explicit Admin/Owner checks to AI configuration create/update/delete/test endpoints even if generic scoring permissions currently block some actions.
- Review Members, SSO, Retention and organization integration APIs for explicit organization-admin authorization.

## 8. UI / PDS product consistency

### Fixed

- Dashboard rebuilt as a PDS Recruitment Control Centre / My Recruitment Desk.
- Dashboard uses the PDS-oriented deep navy, blue and teal visual direction.
- Primary navigation is PDS-first: Dashboard, Requirements, Candidate Database, Allocations where authorized, Settings.
- Generic Candidates, Applications, Interviews and AI Analysis modules were removed from primary navigation.
- Recruiter Workspace prioritizes AI match, priority, strengths/gaps, Skill Analysis and screening.
- Candidate Journey replaces the technical audit-log presentation.

### Still visibly generic

- Requirements page still contains legacy wording such as My Jobs / New Job and older multi-colour ATS styling in parts of the page.
- Several generic settings screens remain visually Reqcore-oriented.
- Global CSS brand tokens are still based on the original Reqcore cornflower-blue palette, so untouched pages do not fully match the dashboard palette.
- Old generic ATS pages remain routable even when hidden from navigation.
- Package metadata and repository documentation still use Reqcore terminology; this is not user-facing but should eventually be cleaned for maintainability.

### Recommended UI pass before launch

Apply the PDS brand palette globally and redesign the Requirements list next. Then clean requirement Settings and any remaining recruiter-visible generic components.

## 9. AI Skill Matrix quality

### Fixed / governed

- 4-5 classifications.
- Maximum 2-3 Mandatory criteria per classification.
- Mandatory target generally 8-12 only when the JD genuinely supports it.
- Skills must be evidence-based and assessable from resume/screening.
- Prompt discourages generic education, years-of-experience labels, vague leadership labels and generic project terminology from being treated as skills.
- Strict OpenAI JSON-schema optional-field failures were fixed by using nullable schema fields.

### Runtime validation pending

The latest Skill Matrix quality prompt changes have not yet been synced and visually tested in Emergent.

## 10. AI provider and error handling

### Fixed

- Central analysis-provider resolution.
- OpenAI, Anthropic, Google and OpenAI-compatible provider support.
- Encrypted API keys.
- Common handling for authentication failure, quota exhaustion, rate limits, model errors, structured-response/schema failures and provider availability errors.
- OpenAI connection was previously validated after API credits were funded.

### Review point

Per-file direct-resume upload errors should remain sanitized; no raw provider payload, key or request content should be surfaced to recruiters.

## 11. Data model and migrations

Known PDS migrations through the current implementation:

- 0999 Skill Matrix
- 1000 Recruitment framework
- 1001 Resume assessment
- 1002 Application resume link
- 1003 Recruiter assignment
- 1004 Requirement TAT
- 1005 Talent Pool
- 1006 Requirement Profile

No new migration was required for the recent visibility, allocation, dashboard or AI-budget changes.

Database reset/reseed is not required and must not be performed during the eventual sync.

## 12. Build and runtime status

Repository scripts provide build, typecheck, unit test and Playwright commands.

There is currently no GitHub workflow result validating the latest branch commits. Therefore the following remain runtime gates and must be tested in the consolidated sync:

1. npm/npx typecheck
2. production Nuxt build
3. migration status without reseeding
4. Admin dashboard
5. recruiter dashboard with allocated-only requirements
6. recruiter direct URL denial for another recruiter's requirement/application
7. Requirement Allocation management
8. Skill Matrix generation and approval
9. Candidate Pool sync including AI budget deferral and hidden below-50 cache
10. direct resume upload
11. Move to Recruitment
12. Recruiter Screening
13. stage progression through Offer
14. Candidate Database and Candidate Journey
15. AI Settings connection test

## 13. Priority closure order before consolidated sync

P0 - Security / data boundary

- Finish assertApplicationAccess across all application-child PDS routes.
- Finish assertInterviewAccess across legacy interview detail/mutation routes.
- Harden comment mutation routes.
- Explicitly protect organization-level AI configuration and admin APIs.

P1 - Workflow / cost

- Cascade requirement reassignment to existing application recruiter ownership.
- Cache direct-upload below-50 assessments.
- Surface AI-budget deferral in Candidate Pool UI.

P2 - UI consistency

- Rebuild Requirements page using PDS palette and terminology.
- Make recruiter navigation show My Account instead of full Settings.
- Move the global brand palette toward the dashboard palette.
- Continue removal of recruiter-visible legacy Reqcore terminology.

P3 - Runtime verification

Perform one consolidated Emergent sync only after the above static closure work is complete, then run build + focused end-to-end smoke tests without resetting the preserved database.

## 14. Audit conclusion

The core PDS recruitment architecture is sound and the main recruitment path is coherent. The most significant issue discovered by the audit was incomplete propagation of the new recruiter-allocation boundary into older organization-wide and application-child endpoints. The major job-level and legacy application-list bypasses have already been corrected during this audit pass.

The application should not be considered release-ready until the remaining P0 endpoints are closed and the consolidated runtime/build test is completed.
