# PDS Recruitment Assistant V1 UAT Checklist

## Purpose

Use this checklist to complete business UAT and freeze the V1 recruitment workflow before release. V1 is not release-ready until all mandatory UAT items pass and the validation security gate is green.

## UAT roles

Test with representative users for:
- Recruiter
- TA/Admin
- Management/Owner/Admin

Confirm recruiters can work only on requirements allocated to them, while privileged users retain the broader recruitment and analytics visibility intended for their role.

## Requirement and allocation flow

- Create or open a Requirement and confirm visible UI wording uses **Requirement**.
- Allocate the Requirement to a recruiter.
- Confirm an unallocated Requirement has no TAT start.
- Confirm allocation establishes `recruitmentRequirementState.assignmentDate` as the TAT start.
- Reassign the Requirement and confirm the current allocation cycle uses the new assignment date.
- Confirm no TAT calculation falls back to `job.createdAt`.

## Candidate and application independence

- Link one candidate to a Requirement and confirm an application/alignment is created independently of candidate identity.
- Link the same candidate to a different Requirement and confirm both applications coexist independently.
- Attempt a duplicate candidate + same Requirement alignment and confirm it is not duplicated.
- Confirm candidate identity dedupe does not remove applications, documents or recruitment evidence.
- Confirm resume parsing does not silently overwrite candidate identity.

## Recruitment profile and assessment

- Confirm a recruitment profile is initialized when a candidate is linked to a Requirement.
- Confirm **Current Fit** and **Last Status** are displayed and updated as separate concepts.
- Confirm reassessment/version history remains available where applicable.

## Recruiter screening

- Start recruiter screening and confirm the recruiter controls the screening flow.
- Confirm screening is focused on the key questions and is practical for a short recruiter conversation, with MCQ-style responses where configured.
- Confirm screening completion is stored as recruitment evidence and does not automatically select or reject the candidate.

## AI governance

- Confirm AI recommendations are advisory only.
- Confirm AI cannot automatically select, reject, rank candidates for an employment decision, or move an application to another recruitment stage without the governed user action.
- Confirm recruiter or hiring-user judgement remains the controlling action.

## Governed stage movement

- Move an application through the governed recruitment stages and confirm each permitted action is enforced.
- Confirm `offer_stage` permits accept or decline actions.
- Confirm `offer_accepted` can move to `joined` only after actual joining is recorded.
- Confirm `joined` can proceed to closure only after the required administration.
- Confirm `closed` does not allow further stage movement.
- Confirm governed stage actions write immutable `stage_change` evidence.
- Confirm generic application updates cannot bypass governed stage actions once the recruitment profile exists.

## Recruiter Performance analytics

- Test 7, 30 and 90 day periods.
- Confirm metrics cover sourced candidates, recruiter screenings completed, hiring-manager interviews completed, offers raised, offers accepted and joined.
- Confirm repeated evidence for the same application + milestone is not double-counted.
- Confirm the same candidate on two different applications can contribute independently.
- Confirm privileged users can select an authorized recruiter and ordinary recruiters remain self-scoped.
- Confirm no peer leaderboard, recruiter ranking, composite score or peer comparison is exposed.

## Source Analytics

- Confirm the source categories are Naukri, Social Media, Referral, Database, Consultant and Others.
- Confirm sourcing is counted by application, not globally by candidate.
- Confirm repeated sourcing evidence does not inflate the application count.
- Confirm downstream interview, offer and joined counts follow governed recruitment milestones rather than generic closure.
- Confirm privileged recruiter filtering attributes sourcing to the recruiter who created the sourcing evidence.

## Cycle Time analytics

- Validate both **Allocation → Offer** and **Allocation → Closure**.
- Confirm Allocation → Offer uses the Requirement allocation date and first governed `offer_stage` event per application.
- Confirm Allocation → Closure uses the Requirement allocation date and governed Requirement `closedAt`.
- Confirm unallocated and chronologically invalid samples are excluded while valid zero-day samples remain valid.
- Confirm recruiter filtering follows the current Requirement owner/current allocation cycle.
- Confirm average, median and sample counts reflect the selected scope.

## Chatbot

- Open the dashboard chatbot and confirm the V1 recruiter-assistance entry point is accessible to the intended users.
- Confirm chatbot guidance remains advisory and does not bypass recruiter permissions, screening controls or governed recruitment-stage actions.
- Confirm candidate/application context remains tied to the correct Requirement when multiple applications exist for the same person.

## Regression and release gate

- Exact-head Browser E2E for commit `ecfdc00b5ea5ff95ab150c774bc2b783a291ac13` passed before this checklist was added.
- The corresponding Validation workflow is not green: its zero-vulnerability dependency audit reported 12 vulnerabilities (4 high, 2 moderate, 6 low), and typecheck, unit tests and production build were skipped after that gate failed.
- Do not treat V1 as release-ready while the dependency security gate remains red.
- After all UAT items are signed off and dependency remediation is complete, run exact-head Browser E2E and Validation again and require both to pass before release.

## Freeze decision

V1 may be considered functionally frozen only when the mandatory business scenarios above are signed off with no unresolved functional blocker. Release approval is a separate decision and additionally requires a green zero-vulnerability validation gate. Keep PR #1 draft and unmerged until an explicit release/merge decision is made.
