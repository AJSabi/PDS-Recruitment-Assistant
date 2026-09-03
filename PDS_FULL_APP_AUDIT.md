# PDS Recruitment Assistant - Full Application Audit

Audit type: Static code, authorization, workflow and UI audit
Branch: feature/pds-skill-matrix
Runtime validation: Pending consolidated Emergent sync

## 1. Current status

The application now follows the intended PDS recruitment model:

New Requirement -> JD / Requirement Profile -> AI Skill Matrix -> AI Candidate Pool -> Move to Recruitment -> Recruiter Screening -> Hiring Manager -> HOD -> HR -> Offer / Final Outcome.

The major static security, ownership, workflow-cost and recruiter-facing UI issues identified during the earlier audit have now been addressed in GitHub. The remaining release gate is consolidated runtime validation: migrations, typecheck/build and end-to-end workflow testing against the preserved database.

## 2. Authorization and data visibility - static closure complete

Current governed model:

- Admin/Owner can see and manage organization-wide recruitment data.
- Recruiters see only requirements allocated to them through recruitment_requirement_state.owner_user_id.
- Requirement list, dashboard metrics, requirement detail, Requirement Profile, Skill Matrix, Candidate Pool and Candidate Register are allocation-scoped server-side.
- Application list/detail and application-child workflow APIs use application-to-requirement access checks.
- Candidate Journey, Recruiter Screening, Resume Assessment, selected resume, reassessment, evidence, interview evidence, stage progression, legacy scores and legacy AI analysis are allocation-scoped.
- Legacy interview detail/update/delete/invitation routes use interview-to-application-to-requirement access checks.
- Job/application comments enforce allocation visibility. Candidate comments remain shared because the Candidate Database is intentionally organization-wide.
- New Requirement creation, requirement deletion, allocation management, AI configuration, AI usage statistics, organization activity, retention and SSO administration are Admin/Owner-only.
- Candidate Database keeps candidate identity/resume availability organization-wide but now filters requirement/application history to the current recruiter's visible requirements.

## 3. Requirement ownership and allocation

Requirement ownership is authoritative.

- Candidate/application ownership inherits the requirement owner.
- Requirement reassignment cascades to existing recruitment application profiles.
- Independent candidate-level recruiter assignment has been retired from the live workflow.
- New requirements remain unallocated until Allocation Management assigns a recruiter.
- Assignment Date is created only when a recruiter is actually allocated.
- A pre-entered Target Closure Date is preserved across allocation/reallocation unless an administrator explicitly changes it.
- If no target date exists when a recruiter is first allocated, the allocation API defaults the target to 60 days from assignment.

## 4. AI Candidate Pool and cost controls

Implemented controls:

- Historical candidate search uses a lightweight prefilter before full AI analysis.
- Full AI analysis is capped at 30 attempts per Candidate Pool refresh.
- Only candidates with final match >=50% are visible in the JD working pool.
- Below-50 candidates remain in the central Candidate Database and are not rejected or deleted.
- Below-50 full AI assessments are retained as hidden cache records for both historical-database matching and direct JD uploads, preventing repeat spend for the same resume + requirement revision.
- Candidate Pool UI surfaces the number of plausible candidates deferred when the 30-analysis budget is reached.
- Move to Recruitment reuses the stored AI assessment instead of rerunning resume analysis.
- The initial AI Candidate Summary is also seeded from that existing assessment; promotion does not require an extra summary call.
- Screening-question generation remains a separate AI action because it creates candidate-specific validation questions.
- Explicit AI Candidate Summary refreshes are rate-limited and never run simply because a page is opened.

## 5. AI Candidate Summary / Final Brief

Migration 1007 adds persistent requirement-specific summary fields to recruitment_application_profile.

The feature provides:

- AI Candidate Summary
- Overall AI Assessment
- confirmed Final Status
- Current Fit
- Evidence Confidence
- recruiter/Hiring Manager/HOD/HR interview briefs only when evidence exists
- Final Recruitment Brief for meaningful late/final outcomes

Resume analysis seeds the initial summary without an additional AI call. Recruiter screening completion, interview evidence, stage changes and manual reassessment mark the summary stale. The recruiter explicitly chooses Update AI Summary when newer evidence should be consolidated.

The summary is visible in Recruiter Workspace, Candidate Register and Candidate Database requirement history. Candidate Register CSV includes summary/final brief fields.

AI instructions prohibit invented interview feedback, unsupported candidate claims, protected/sensitive inference and autonomous hiring decisions.

## 6. Recruitment workflow integrity

Normal progression:

Recruiter Screening -> Hiring Manager Pending -> Hiring Manager Completed -> HOD Pending -> HOD Completed -> HR Pending -> HR Completed -> Offer.

Exception paths remain Hold for Comparison, Reassess and Not Proceeding.

Key controls:

- backend validates confirmed stage transitions;
- Resume Reviewed and Recruiter Screening statuses remain evidence-driven;
- HM/HOD/HR interview evidence is optional in V1 because interviews happen externally;
- Offer Accepted / Declined and final lifecycle decisions remain explicit recruiter/admin actions;
- Candidate Journey retains the auditable history while presenting recruiter-readable milestones.

## 7. Candidate Database

The Candidate Database is intentionally a shared organization-wide talent database.

Recruiters may see candidate identity, contact details and resume availability across the organization so prior talent can be reused. Requirement/application history, status, recruiter, AI summary and recruitment decisions are returned only for requirements that user is authorized to access. Admin/Owner retains full history.

## 8. Recruiter-facing UI and PDS product identity

Completed redesigns:

- PDS Recruitment Control Centre / My Recruitment Desk dashboard
- Requirements page
- New Requirement flow
- JD & Skill Matrix setup flow
- AI Candidate Pool
- Recruiter Workspace
- AI Candidate Summary card
- Candidate Register summary fields
- Candidate Database summary/history presentation
- Requirement Allocation Management
- primary navigation using Requirements / Candidate Database / Allocations / My Account or Settings

Global brand tokens now use the PDS navy/blue/teal direction rather than the original Reqcore cornflower palette. Authenticated dashboard/settings demo and Reqcore deployment banners have been removed.

Recruiters see My Account rather than full organization Settings. Admin/Owner retains Settings.

## 9. AI Skill Matrix governance

Current approval rules:

- 4-5 classifications
- 2-3 Mandatory criteria per classification
- 8-12 Mandatory criteria overall for approval
- evidence-based, assessable skill/requirement wording
- editable AI proposal before explicit approval
- approved matrix required before Candidate Pool matching

The current prompt discourages vague labels, generic education/project wording and unsupported skill inference.

Runtime quality validation of the latest prompt remains pending.

## 10. Data model and migrations

PDS migrations currently registered:

- 0999 Skill Matrix
- 1000 Recruitment framework
- 1001 Resume assessment
- 1002 Application resume link
- 1003 Recruiter assignment
- 1004 Requirement TAT
- 1005 Talent Pool
- 1006 Requirement Profile
- 1007 AI Candidate Summary

The migration journal contains 1007. No database reset or reseed is required or permitted for the consolidated sync.

## 11. Pre-sync QA findings fixed

The final static pass found and corrected these issues before runtime sync:

1. Requirement Profile update silently created an Assignment Date even for unallocated requirements. It now preserves null until allocation.
2. Requirement Profile update silently defaulted Target Closure to +60 days before allocation. The default now occurs at actual allocation when no prior target exists.
3. Allocation could overwrite or erase a closure target captured earlier. Existing target dates are now preserved unless explicitly changed.
4. Candidate Database exposed all application history to recruiters despite the shared-candidate/restricted-recruitment model. Recruitment history is now visibility-scoped.
5. Candidate Database recruiter-name lookup queried all users rather than organization membership. It is now organization-scoped.
6. Talent-Pool promotion did not seed the new AI Candidate Summary fields, creating an unnecessary extra summary call. Promotion now reuses the paid assessment.
7. AI Candidate Summary generation had no explicit rate limit. Authorized summary refreshes are now rate-limited.

## 12. Runtime/build status

There is no GitHub CI status validating the latest feature branch. Therefore static QA cannot substitute for runtime validation.

The consolidated sync must validate, without resetting the preserved database:

1. migration application through 1007
2. TypeScript / Nuxt typecheck
3. production Nuxt build
4. Admin/Owner login and dashboard
5. recruiter allocated-only dashboard and Requirements list
6. direct URL denial to another recruiter's requirement/application/interview
7. New Requirement creation remains unallocated
8. Requirement Allocation and +60-day default behavior
9. JD save, AI Skill Matrix generation and approval
10. Candidate Pool sync, >=50 visibility, below-50 hidden caching and 30-analysis deferral
11. direct resume upload and dedupe
12. Move to Recruitment and inherited summary
13. Recruiter Screening and candidate-specific questions
14. HM/HOD/HR evidence and stage progression
15. AI Candidate Summary stale/update/final brief behavior
16. Candidate Register
17. Candidate Database shared profile + restricted recruitment history
18. Offer/final lifecycle states
19. AI Settings connection test for Admin/Owner

## 13. Release conclusion

The static architecture is now in a substantially release-candidate state. The major authorization boundary, requirement ownership, repeat-AI-cost and recruiter-facing product-consistency issues identified during the audit have been closed in code.

The application should still not be treated as release-ready until the consolidated runtime migration, typecheck/build and end-to-end smoke test pass successfully. Any runtime issue discovered during that pass should be fixed without reseeding the existing database.
