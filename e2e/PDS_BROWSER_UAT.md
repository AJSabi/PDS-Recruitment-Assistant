# PDS Recruitment Assistant — Browser UAT Closure Matrix

Validated repository baseline before this UAT stage: `ade9b26896cb5885b40227d533c6bca4bcea71cb`.

## Purpose

This matrix defines the browser-level acceptance criteria required before the PDS Recruitment Assistant can be treated as application-complete and ready for deployment/UAT handover. It focuses on PDS operating rules, RBAC, recruiter workflows, candidate history preservation, TAT behaviour, and hiring-decision safeguards.

## Execution rules

- Run against a controlled UAT database. Do not reset or reseed production data.
- Test with at least three roles: Recruiter, TA Lead/Admin, and Management/Admin.
- Use at least two recruiter accounts so allocation boundaries can be verified.
- Capture evidence for each failed case: screenshot, route, account/role, timestamp, and relevant request/response.
- A failed Critical case blocks application closure.
- Do not treat Current Fit as Recruitment Status.
- Do not treat AI output as an automatic hiring decision.

## Critical browser UAT cases

| ID | Area | Scenario | Expected result | Priority |
|---|---|---|---|---|
| UAT-01 | Authentication | Recruiter signs in and opens dashboard | Recruiter reaches individual Recruiter Command Centre without admin-only content | Critical |
| UAT-02 | RBAC | Recruiter A attempts to open Recruiter B's allocated requirement directly by URL | Access denied or requirement not exposed | Critical |
| UAT-03 | RBAC | Recruiter calls/opens management analytics | Access denied | Critical |
| UAT-04 | RBAC | TA Lead/Admin opens TA Operations | Team-operational scope visible as designed | Critical |
| UAT-05 | RBAC | Management/Admin opens Management Recruitment Dashboard | Privileged analytics visible | Critical |
| UAT-06 | Requirement allocation | Create/open an unallocated requirement | Requirement exists but recruiter TAT has not started | Critical |
| UAT-07 | Requirement allocation | Allocate requirement to Recruiter A | Allocation persists and recruiter gains access | Critical |
| UAT-08 | TAT | Inspect newly allocated requirement | TAT starts from allocation timestamp/date, not job creation date | Critical |
| UAT-09 | TAT | Inspect unallocated requirement | No fabricated overdue status or elapsed recruiter TAT | Critical |
| UAT-10 | Requirement | Open Requirement Command Centre | JD, Skill Matrix, pipeline and requirement controls load consistently | Critical |
| UAT-11 | JD/Skill Matrix | Edit JD/Skill Matrix and save | Version/change persists and reload displays saved values | Critical |
| UAT-12 | Candidate intake | Add a new candidate to allocated requirement | Candidate, application/profile and requirement linkage are created successfully | Critical |
| UAT-13 | Duplicate identity | Add an existing person to another requirement | Same Candidate ID is reused; a new candidate master is not silently created | Critical |
| UAT-14 | Duplicate resume | Upload a new resume for an existing candidate | New document is added; older resume/document history remains available | Critical |
| UAT-15 | Candidate identity | Resume parser suggests changed identity/profile data | Candidate master identity is not silently overwritten without recruiter review/confirmation | Critical |
| UAT-16 | Candidate Workspace | Open Recruiter Candidate Workspace | Candidate profile, fit, status, evidence, documents and history load without cross-candidate leakage | Critical |
| UAT-17 | Current Fit | Change Current Fit only | Fit persists without silently changing recruitment stage/status | Critical |
| UAT-18 | Recruitment Status | Move candidate to another recruitment stage/status | Status persists without silently rewriting Current Fit | Critical |
| UAT-19 | Screening | Start recruiter screening | Screening session opens for the correct candidate/application | Critical |
| UAT-20 | Screening | Generate/use screening questionnaire | Recruiter flow uses no more than 10 key questions; MCQ-first where practical | Critical |
| UAT-21 | Screening | Save notes/recommendation | Recruiter notes and recommendation persist after reload | Critical |
| UAT-22 | AI safeguards | Review AI assessment/output | Output is advisory; UI does not auto-select, auto-reject or present AI ranking as hiring decision | Critical |
| UAT-23 | Interview evidence | Add interview evidence/feedback | Evidence persists and appears in candidate/recruitment history | Critical |
| UAT-24 | Recruitment Journey | Review candidate journey | Historical applications, screenings, assessments, evidence and documents remain visible and correctly ordered | Critical |
| UAT-25 | Reassessment | Reassess candidate after JD/Skill Matrix/profile change | New assessment/version is added without destroying prior assessment history | Critical |
| UAT-26 | Duplicate resolution | Resolve a duplicate through the active UI/API flow | Operation completes atomically; no partial duplicate state remains | Critical |
| UAT-27 | Cross-org security | Attempt to access another organisation's candidate/job identifier | Access denied; no data leakage | Critical |
| UAT-28 | Public application | Submit a valid public application | Application and required document linkage complete successfully | Critical |
| UAT-29 | Public application failure | Force/observe file-storage failure during application | No partial application is left committed | Critical |
| UAT-30 | Documents | Open/download permitted candidate document | Authorised user can access; unauthorised user cannot | Critical |
| UAT-31 | Chatbot scope | Recruiter uses chatbot outside allocated job scope | Out-of-scope requirement/candidate data is denied | Critical |
| UAT-32 | Session isolation | Sign out Recruiter A and sign in Recruiter B | No cached Recruiter A requirement/candidate data remains visible | Critical |

## High-priority UX and functional cases

| ID | Area | Scenario | Expected result | Priority |
|---|---|---|---|---|
| UAT-33 | Recruiter dashboard | Open Recruiter Daily Pulse/KPI layer | Individual recruiter metrics load; no leaderboard/ranking semantics | High |
| UAT-34 | TA Operations | Review team workload/requirements | Team-operational data is coherent and does not expose management-only analytics | High |
| UAT-35 | Candidate Pipeline | Filter/search candidates | Correct subset appears and state remains usable after navigation | High |
| UAT-36 | Candidate Database | Search known candidate | Existing candidate is discoverable with correct master identity | High |
| UAT-37 | Requirement Settings | Update allowed settings | Changes persist and do not bypass PDS operating rules | High |
| UAT-38 | Empty states | Open requirement/candidate sections with no records | Clear PDS-specific empty state; no broken generic ATS placeholder | High |
| UAT-39 | Errors | Trigger a recoverable validation/API error | Clear user-facing message; no raw stack trace or silent failure | High |
| UAT-40 | Loading | Navigate across major PDS pages | Loading states are stable; no stale data flashes from another requirement/candidate | High |
| UAT-41 | Terminology | Review active recruitment UI | PDS terminology is consistent; no conflicting legacy generic ATS status model appears | High |
| UAT-42 | Navigation | Move Dashboard → Requirement → Candidate → Screening → back | Context and navigation remain coherent | High |
| UAT-43 | Date/time | Review allocation, TAT, screening and history dates | Dates/times display consistently and correspond to persisted events | High |
| UAT-44 | Responsive UI | Review critical recruiter pages at common laptop/tablet widths | Core controls remain usable without inaccessible actions | High |

## Application-closure acceptance criteria

Application closure may be declared only when:

1. All Critical cases UAT-01 through UAT-32 pass.
2. No unresolved Severity-1 or Severity-2 browser defect remains.
3. Any accepted High-priority defect has a documented workaround and owner.
4. Role/access tests pass with distinct Recruiter, TA Lead/Admin and Management/Admin accounts.
5. Candidate identity, resume history, application history and assessment history are demonstrably preserved.
6. TAT is demonstrably allocation-driven and never fabricated before allocation.
7. Current Fit and Recruitment Status remain independently persisted.
8. AI remains advisory and never performs the hiring decision.
9. Cross-org and cross-recruiter access controls pass browser/API-backed verification.
10. Final UAT evidence is attached to the release/closure record.

## Automation split

Automate first with Playwright:

- authentication and role entry points
- recruiter allocation visibility
- no TAT before allocation / TAT after allocation
- candidate intake
- duplicate candidate and resume preservation
- Current Fit versus Recruitment Status independence
- recruiter screening persistence
- management access restriction
- cross-org/cross-recruiter denial
- public application success/failure atomicity

Keep as controlled manual UAT where automation adds little value initially:

- terminology/visual consistency
- responsive-layout review
- recruiter usability/readability
- management-dashboard interpretation
- qualitative AI wording/advisory-language review

## Closure status

- Repository/CI closure: complete at the baseline preceding this UAT stage.
- Browser/UAT closure: pending execution of this matrix.
- Deployment closure: pending hosting, production-like environment and deployed UAT.
