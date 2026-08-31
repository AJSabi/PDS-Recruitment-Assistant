import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = readFileSync('server/utils/ai/pdsScreening.ts', 'utf8')
const workflowSchema = readFileSync('server/utils/schemas/recruitmentWorkflow.ts', 'utf8')
const answerApi = readFileSync('server/api/applications/[id]/screening/answer.post.ts', 'utf8')
const generateApi = readFileSync('server/api/applications/[id]/screening/generate.post.ts', 'utf8')
const startApi = readFileSync('server/api/applications/[id]/screening/start.post.ts', 'utf8')
const screeningUi = readFileSync('app/components/PdsRecruiterScreening.vue', 'utf8')
const recruitmentPage = readFileSync('app/pages/dashboard/recruitment/[id].vue', 'utf8')
const notInterestedApi = readFileSync('server/api/applications/[id]/screening/not-interested.post.ts', 'utf8')
const notInterestedUi = readFileSync('app/components/PdsCandidateNotInterested.vue', 'utf8')

describe('PDS recruiter screening policy', () => {
  it('keeps recruiter screening bounded and candidate-specific', () => {
    expect(source).toContain('Generate 5-8 base questions')
    expect(source).toContain('10 or fewer')
    expect(source).toContain('Mandatory skills marked requires_verification')
    expect(source).toContain('Ask for PERSONAL contribution, ownership, scale, recency and measurable result')
    expect(source).toContain('Avoid generic interview questions')
  })

  it('uses MCQ-first capture for recruiter speed', () => {
    expect(source).toContain('MCQ-FIRST CAPTURE')
    expect(source).toContain('Provide 4-6 realistic options whenever possible')
    expect(source).toContain('Other / Exact Response')
    expect(screeningUi).toContain('MCQ-first capture')
    expect(screeningUi).toContain('selectedOption === option')
    expect(screeningUi).toContain('v-else-if="otherSelected"')
  })

  it('supports conditional answer-based follow-up questions without an AI call per answer', () => {
    expect(workflowSchema).toContain('followUps: z.array(screeningFollowUpSchema).max(3).optional()')
    expect(source).toContain('ADAPTIVE FOLLOW-UPS')
    expect(answerApi).toContain('matchingFollowUp')
    expect(answerApi).toContain('updatedQuestions.splice(currentIndex + 1, 0')
    expect(answerApi).toContain('adaptiveFollowUpAdded')
    expect(answerApi).not.toContain('generatePdsScreeningQuestions')
  })

  it('does not refresh the whole recruitment workspace after every screening response', () => {
    const submitBlock = screeningUi.slice(screeningUi.indexOf('async function submitAnswer()'), screeningUi.indexOf('async function getAiInterpretation()'))
    expect(submitBlock).toContain('await refresh()')
    expect(submitBlock).not.toContain("emit('changed')")
  })

  it('preserves completed screening until Revalidation Call starts, then snapshots it before reset', () => {
    expect(generateApi).toContain("existing?.status === 'completed' && profile.lastStatus === 'reassess'")
    expect(generateApi).toContain('priorScreeningPreserved: true')
    expect(generateApi).toContain('return { questions')
    expect(startApi).toContain("snapshotReason: 'pre_restart_snapshot'")
    expect(startApi).toContain('priorQuestions: existing.questions ?? []')
    expect(startApi).toContain('priorResponses')
    expect(startApi).toContain('priorFinalFit: existing.finalFit ?? null')
  })

  it('does not let Hold bypass its recorded continuation by restarting recruiter screening', () => {
    expect(startApi).toContain("const allowedStartStatuses = new Set(['resume_reviewed', 'reassess', 'recruiter_screening_pending'])")
    expect(startApi).not.toContain("'hold_for_comparison', 'reassess'")
    expect(generateApi).not.toContain("'hold_for_comparison', 'reassess'")
  })

  it('allows a completed screening to reopen as a fresh revalidation flow after Reassess', () => {
    expect(screeningUi).toContain("const reassessmentMode = computed(() => props.recruitmentStatus === 'reassess')")
    expect(screeningUi).toContain("reassessmentMode.value && screening.value?.status === 'completed'")
    expect(screeningUi).toContain('Prepare Revalidation Questions')
    expect(recruitmentPage).toContain(':recruitment-status="profile?.lastStatus"')
    expect(recruitmentPage).toContain("profile.value?.lastStatus === 'reassess' ? 'Revalidate Candidate'")
  })

  it('records Candidate Not Interested as a candidate decision, not recruiter rejection', () => {
    expect(notInterestedApi).toContain("lastStatus: 'not_proceeding'")
    expect(notInterestedApi).toContain("event: 'candidate_not_interested'")
    expect(notInterestedApi).toContain('candidateDecision: true')
    expect(notInterestedApi).toContain('recruiterRejection: false')
    expect(notInterestedApi).toContain('Candidate remains in the central Candidate Database')
  })

  it('allows Candidate Not Interested before or during screening and stops an active screening session', () => {
    expect(notInterestedApi).toContain("['resume_reviewed', 'recruiter_screening_pending']")
    expect(notInterestedApi).toContain("status: 'completed'")
    expect(notInterestedApi).toContain("syncApplicationStatusForRecruitmentStage(orgId, applicationId, 'not_proceeding')")
  })

  it('offers practical candidate-decision reasons and governed reopening', () => {
    expect(notInterestedUi).toContain('Candidate Not Interested')
    expect(notInterestedUi).toContain('Compensation not suitable')
    expect(notInterestedUi).toContain('Location not suitable')
    expect(notInterestedUi).toContain('may be reconsidered later through Reassess')
  })
})