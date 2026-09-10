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

- Confirm AI recommendations used in the V1 recruitment workflow are advisory only.
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
- Confirm ordinary recruiters see only applications they personally sourced within their authorized Requirement scope.
- Confirm an invalid privileged recruiter selector is rejected rather than silently accepted.

## Cycle Time analytics

- Validate both **Allocation → Offer** and **Allocation → Closure**.
- Confirm Allocation → Offer uses the Requirement allocation date and first governed `offer_stage` event per application.
- Confirm Allocation → Closure uses the Requirement allocation date and governed Requirement `closedAt`.
- Confirm unallocated and chronologically invalid samples are excluded while valid zero-day samples remain valid.
- Confirm recruiter filtering follows the current Requirement owner/current allocation cycle.
- Confirm ordinary recruiters remain limited to Requirements currently owned by them.
- Confirm an invalid privileged recruiter selector is rejected rather than silently accepted.
- Confirm average, median and sample counts reflect the selected scope.

## Shared dashboard recruiter filter

- For TA/Admin/Management users, select a recruiter in Recruiter Performance and confirm the same recruiter filter is propagated to Source Analytics and Cycle Time.
- Confirm Source Analytics applies the selected recruiter by immutable sourcing-evidence creator.
- Confirm Cycle Time applies the selected recruiter by current Requirement ownership/current allocation cycle.
- Clear the recruiter selection and confirm all three panels return to the authorized team scope.
- Confirm ordinary recruiters cannot select another recruiter and remain scoped to their own authorized recruitment work.

## Chatbot scope decision

The feature-flagged dashboard chatbot is **deferred from the frozen V1 scope** and is not a mandatory V1 UAT item. It will be assessed separately for V1.1 after chatbot-specific AI-governance acceptance, including neutral candidate comparison, prohibition of automated ranking/shortlisting decisions, requirement-scope enforcement and governed stage-action boundaries.

The V1 functional document should therefore describe the governed recruitment workflow and its embedded advisory AI functions, but should not present the dashboard chatbot as an approved V1 production function.

## Regression and release gate

- Exact-head Browser E2E for commit `1400aeb9d4ca3c6ab4a99404cca5e09c14715d4f` passed after the recruiter-performance response mapping, Source Analytics recruiter-scope validation and Cycle Time recruiter-scope validation changes.
- The Validation workflow on the same functional checkpoint remains blocked by the zero-vulnerability dependency audit; downstream typecheck, unit tests and production build are skipped once that gate fails.
- The dependency-security failure is a release-readiness blocker, not an unresolved V1 business-function definition.
- Do not treat V1 as release-ready while the dependency security gate remains red.
- After business UAT is signed off and dependency remediation is complete, run exact-head Browser E2E and Validation again and require both to pass before release.

## Functional freeze status

The V1 functional scope is now defined as the governed Requirement-to-closure recruitment workflow, including Skill Matrix, candidate/application independence, recruitment profile, recruiter-controlled screening, advisory AI, governed stage movement, Recruiter Performance, Source Analytics, Cycle Time and role-based visibility. The dashboard chatbot is explicitly outside V1 and deferred to V1.1.

No known functional-design ambiguity remains before preparation of the functional document. The remaining mandatory step is business UAT sign-off by representative Recruiter, TA/Admin and Management/Owner/Admin users. This sign-off cannot be substituted by automated test results.

Keep PR #1 draft and unmerged until an explicit release/merge decision is made.