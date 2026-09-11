import { test, expect } from '../fixtures'

async function createRequirement(page: any, title: string) {
  const response = await page.request.post('/api/jobs', {
    data: {
      title,
      description: 'E2E requirement used to verify recruiter screening governance.',
      location: 'Noida',
      type: 'full_time',
      status: 'open',
      questions: [],
      criteria: [],
    },
  })
  expect(response.status()).toBe(201)
  return response.json()
}

async function createCandidate(page: any, runId: number, suffix: string) {
  const response = await page.request.post('/api/candidates', {
    data: {
      firstName: 'Screening',
      lastName: `${suffix}${runId}`,
      email: `pds-screening-${suffix.toLowerCase()}-${runId}@test.local`,
    },
  })
  expect(response.status()).toBe(201)
  return response.json()
}

async function createApplication(page: any, candidateId: string, jobId: string) {
  const response = await page.request.post('/api/applications', {
    data: { candidateId, jobId },
  })
  expect(response.status()).toBe(201)
  return response.json()
}

async function moveToReassess(page: any, applicationId: string) {
  const notProceeding = await page.request.post(`/api/applications/${applicationId}/stage/confirm`, {
    data: { stage: 'not_proceeding', note: 'E2E setup for governed recruiter screening.' },
  })
  expect(notProceeding.ok()).toBeTruthy()

  const reassess = await page.request.post(`/api/applications/${applicationId}/stage/confirm`, {
    data: { stage: 'reassess' },
  })
  expect(reassess.ok()).toBeTruthy()
}

test.describe('PDS Recruiter Screening Governance', () => {
  test('screening stays application-bound, capped at 10 questions, recruiter-controlled, and persists final evidence', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    const runId = Date.now()
    const job = await createRequirement(page, `PDS Screening ${runId}`)
    const candidateA = await createCandidate(page, runId, 'A')
    const candidateB = await createCandidate(page, runId, 'B')
    const applicationA = await createApplication(page, candidateA.id, job.id)
    const applicationB = await createApplication(page, candidateB.id, job.id)

    await moveToReassess(page, applicationA.id)

    const elevenQuestions = Array.from({ length: 11 }, (_, index) => ({
      id: `q${index + 1}`,
      question: `Governance question ${index + 1}?`,
      options: ['Yes', 'No'],
    }))
    const overLimitResponse = await page.request.post(`/api/applications/${applicationA.id}/screening/start`, {
      data: { questions: elevenQuestions },
    })
    expect([400, 422]).toContain(overLimitResponse.status())

    const questions = elevenQuestions.slice(0, 10)
    const startResponse = await page.request.post(`/api/applications/${applicationA.id}/screening/start`, {
      data: { questions },
    })
    expect(startResponse.ok()).toBeTruthy()
    const started = await startResponse.json()
    expect(started.progress).toEqual({ answered: 0, total: 10 })
    expect(started.currentQuestion.id).toBe('q1')

    const applicationBScreeningResponse = await page.request.get(`/api/applications/${applicationB.id}/screening`)
    expect(applicationBScreeningResponse.ok()).toBeTruthy()
    const applicationBScreening = await applicationBScreeningResponse.json()
    expect(applicationBScreening.screening.status).toBe('not_started')
    expect(applicationBScreening.progress).toEqual({ answered: 0, total: 0 })

    const outOfSequenceResponse = await page.request.post(`/api/applications/${applicationA.id}/screening/answer`, {
      data: { questionId: 'q2', answer: 'Yes' },
    })
    expect(outOfSequenceResponse.status()).toBe(422)

    for (let index = 0; index < questions.length; index += 1) {
      const question = questions[index]
      const answerResponse = await page.request.post(`/api/applications/${applicationA.id}/screening/answer`, {
        data: { questionId: question.id, answer: index % 2 === 0 ? 'Yes' : 'No' },
      })
      expect(answerResponse.ok()).toBeTruthy()
      const answerResult = await answerResponse.json()
      expect(answerResult.progress.answered).toBe(index + 1)
      expect(answerResult.progress.total).toBe(10)
    }

    const readyResponse = await page.request.get(`/api/applications/${applicationA.id}/screening`)
    expect(readyResponse.ok()).toBeTruthy()
    const ready = await readyResponse.json()
    expect(ready.screening.status).toBe('in_progress')
    expect(ready.screening.responses).toHaveLength(10)
    expect(ready.readyToComplete).toBe(true)
    expect(ready.currentQuestion).toBeNull()
    expect(ready.screening.finalFit).toBeNull()
    expect(ready.screening.recommendedNextStep).toBeNull()

    const profileBeforeDecisionResponse = await page.request.get(`/api/applications/${applicationA.id}/recruitment-profile`)
    expect(profileBeforeDecisionResponse.ok()).toBeTruthy()
    const profileBeforeDecision = (await profileBeforeDecisionResponse.json()).profile
    expect(profileBeforeDecision.lastStatus).toBe('recruiter_screening_pending')
    expect(profileBeforeDecision.currentFit).toBe('not_yet_assessed')

    const recruiterNotes = 'Candidate demonstrated relevant customer ownership; validate commercial closure depth in the hiring manager round.'
    const completeResponse = await page.request.post(`/api/applications/${applicationA.id}/screening/complete`, {
      data: {
        finalFit: 'potential_fit',
        recommendedNextStep: 'proceed_to_hiring_manager_round',
        conversationBrief: recruiterNotes,
        validationFocus: ['Commercial closure ownership'],
      },
    })
    expect(completeResponse.ok()).toBeTruthy()
    const completed = await completeResponse.json()
    expect(completed.finalAssessment.currentFit).toBe('potential_fit')
    expect(completed.finalAssessment.lastStatus).toBe('recruiter_screening_completed')
    expect(completed.finalAssessment.recommendedNextStep).toBe('proceed_to_hiring_manager_round')

    const persistedScreeningResponse = await page.request.get(`/api/applications/${applicationA.id}/screening`)
    expect(persistedScreeningResponse.ok()).toBeTruthy()
    const persistedScreening = (await persistedScreeningResponse.json()).screening
    expect(persistedScreening.status).toBe('completed')
    expect(persistedScreening.questions).toHaveLength(10)
    expect(persistedScreening.responses).toHaveLength(10)
    expect(persistedScreening.finalFit).toBe('potential_fit')
    expect(persistedScreening.recommendedNextStep).toBe('proceed_to_hiring_manager_round')
    expect(persistedScreening.conversationBrief).toBe(recruiterNotes)
    expect(persistedScreening.recruiterNotes).toBe(recruiterNotes)
    expect(persistedScreening.recommendation).toBe('proceed_to_hiring_manager_round')
    expect(persistedScreening.validationFocus).toEqual(['Commercial closure ownership'])

    const profileAfterDecisionResponse = await page.request.get(`/api/applications/${applicationA.id}/recruitment-profile`)
    expect(profileAfterDecisionResponse.ok()).toBeTruthy()
    const profileAfterDecision = (await profileAfterDecisionResponse.json()).profile
    expect(profileAfterDecision.lastStatus).toBe('recruiter_screening_completed')
    expect(profileAfterDecision.currentFit).toBe('potential_fit')
    expect(profileAfterDecision.conversationBrief).toBe(recruiterNotes)

    const applicationBAfterResponse = await page.request.get(`/api/applications/${applicationB.id}/screening`)
    expect(applicationBAfterResponse.ok()).toBeTruthy()
    const applicationBAfter = await applicationBAfterResponse.json()
    expect(applicationBAfter.screening.status).toBe('not_started')
  })
})
