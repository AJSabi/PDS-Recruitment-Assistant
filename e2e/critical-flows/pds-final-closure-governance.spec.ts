import { test, expect, declineAnalyticsConsent } from '../fixtures'

async function createRequirement(page: any, title: string) {
  const response = await page.request.post('/api/jobs', {
    data: {
      title,
      description: 'E2E requirement used for final PDS UAT closure evidence.',
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

async function createCandidateApplication(page: any, jobId: string, runId: number) {
  const candidateResponse = await page.request.post('/api/candidates', {
    data: {
      firstName: 'Closure',
      lastName: `Candidate${runId}`,
      email: `closure-candidate-${runId}@test.local`,
    },
  })
  expect(candidateResponse.status()).toBe(201)
  const candidate = await candidateResponse.json()

  const applicationResponse = await page.request.post('/api/applications', {
    data: { candidateId: candidate.id, jobId },
  })
  expect(applicationResponse.status()).toBe(201)
  const application = await applicationResponse.json()

  return { candidate, application }
}

async function createIndependentOrganization(browser: any, runId: number) {
  const context = await browser.newContext()
  await declineAnalyticsConsent(context)
  const page = await context.newPage()
  const password = process.env.E2E_TEST_PASSWORD || 'TestPassword123!'
  const account = {
    name: `Cross Org User ${runId}`,
    email: `cross-org-user-${runId}@test.local`,
    password,
    orgName: `Cross Org ${runId}`,
  }

  await page.goto('/auth/sign-up')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Name').fill(account.name)
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password', { exact: true }).fill(account.password)
  await page.getByLabel('Confirm password').fill(account.password)

  await Promise.all([
    page.waitForResponse(response => response.url().includes('/api/auth/sign-up') && response.status() === 200),
    page.getByRole('button', { name: 'Sign up' }).click(),
  ])

  await page.waitForURL(
    url => url.pathname.includes('/onboarding/') || url.pathname.includes('/auth/sign-in'),
    { waitUntil: 'commit', timeout: 30_000 },
  )

  if (page.url().includes('/auth/sign-in')) {
    await page.waitForLoadState('networkidle')
    await page.getByLabel('Email').fill(account.email)
    await page.getByLabel('Password').fill(account.password)
    await Promise.all([
      page.waitForResponse(response => response.url().includes('/api/auth/sign-in') && response.status() === 200),
      page.getByRole('button', { name: 'Sign in', exact: true }).click(),
    ])
    await page.goto('/onboarding/create-org')
  }

  await page.getByLabel('Organization name').waitFor({ state: 'visible', timeout: 30_000 })
  await page.getByLabel('Organization name').fill(account.orgName)
  await page.getByRole('button', { name: 'Create organization' }).click()

  await page.waitForURL(
    url => url.pathname.includes('/dashboard') || url.pathname.includes('/auth/sign-in'),
    { waitUntil: 'commit', timeout: 30_000 },
  )

  if (page.url().includes('/auth/sign-in')) {
    await page.getByLabel('Email').fill(account.email)
    await page.getByLabel('Password').fill(account.password)
    await Promise.all([
      page.waitForResponse(response => response.url().includes('/api/auth/sign-in') && response.status() === 200),
      page.getByRole('button', { name: 'Sign in', exact: true }).click(),
    ])
    await page.goto('/dashboard')
  }

  await page.waitForLoadState('networkidle')
  return { context, page }
}

test.describe('PDS Final UAT Closure Governance', () => {
  test('interview evidence persists and reassessment creates new evidence while preserving prior versions', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    const runId = Date.now()
    const requirement = await createRequirement(page, `PDS Final Closure ${runId}`)
    const { application } = await createCandidateApplication(page, requirement.id, runId)

    const notProceedingResponse = await page.request.post(`/api/applications/${application.id}/stage/confirm`, {
      data: { stage: 'not_proceeding', note: 'Final UAT setup for governed reassessment.' },
    })
    expect(notProceedingResponse.ok()).toBeTruthy()

    const enterReassessResponse = await page.request.post(`/api/applications/${application.id}/stage/confirm`, {
      data: { stage: 'reassess' },
    })
    expect(enterReassessResponse.ok()).toBeTruthy()

    const interviewResponse = await page.request.post(`/api/applications/${application.id}/interview-evidence`, {
      data: {
        interviewType: 'interview',
        summary: 'Final UAT interview evidence persists in the recruitment journey.',
        strengths: ['Relevant capability confirmed'],
        concerns: ['One item requires validation'],
        validationFocus: ['Validate ownership depth'],
        recommendation: 'reassess',
        updateCurrentFit: false,
      },
    })
    expect(interviewResponse.ok()).toBeTruthy()
    const interviewResult = await interviewResponse.json()
    expect(interviewResult.evidence?.id).toBeTruthy()
    expect(interviewResult.statusChanged).toBe(false)

    const firstReassessmentResponse = await page.request.post(`/api/applications/${application.id}/reassess`, {
      data: {
        summary: 'First final UAT reassessment version.',
        currentFit: 'potential_fit',
        nextAction: 'Validate remaining concern.',
      },
    })
    expect(firstReassessmentResponse.ok()).toBeTruthy()
    const firstReassessment = await firstReassessmentResponse.json()
    expect(firstReassessment.evidence?.id).toBeTruthy()

    const secondReassessmentResponse = await page.request.post(`/api/applications/${application.id}/reassess`, {
      data: {
        summary: 'Second final UAT reassessment version.',
        currentFit: 'strong_fit',
        nextAction: 'Proceed with validated evidence.',
      },
    })
    expect(secondReassessmentResponse.ok()).toBeTruthy()
    const secondReassessment = await secondReassessmentResponse.json()
    expect(secondReassessment.evidence?.id).toBeTruthy()
    expect(secondReassessment.evidence.id).not.toBe(firstReassessment.evidence.id)

    const historyResponse = await page.request.get(`/api/applications/${application.id}/history`)
    expect(historyResponse.ok()).toBeTruthy()
    const history = await historyResponse.json()
    const evidenceById = new Map(history.evidence.map((item: any) => [item.id, item]))

    expect(evidenceById.has(interviewResult.evidence.id)).toBe(true)
    expect(evidenceById.has(firstReassessment.evidence.id)).toBe(true)
    expect(evidenceById.has(secondReassessment.evidence.id)).toBe(true)
    expect(evidenceById.get(interviewResult.evidence.id)?.type).toBe('interview')
    expect(evidenceById.get(firstReassessment.evidence.id)?.type).toBe('manual_reassessment')
    expect(evidenceById.get(secondReassessment.evidence.id)?.type).toBe('manual_reassessment')
    expect(history.profile.currentFit).toBe('strong_fit')
    expect(history.profile.lastStatus).toBe('reassess')
  })

  test('resource IDs from one organization are denied in another organization', async ({ authenticatedPage, browser }) => {
    const ownerPage = authenticatedPage
    const runId = Date.now()
    const requirement = await createRequirement(ownerPage, `PDS Cross Org ${runId}`)
    const { candidate, application } = await createCandidateApplication(ownerPage, requirement.id, runId + 1)

    const { context, page: otherOrgPage } = await createIndependentOrganization(browser, runId)
    try {
      const jobResponse = await otherOrgPage.request.get(`/api/jobs/${requirement.id}`)
      expect(jobResponse.status()).toBe(404)

      const candidateResponse = await otherOrgPage.request.get(`/api/candidates/${candidate.id}`)
      expect(candidateResponse.status()).toBe(404)

      const applicationResponse = await otherOrgPage.request.get(`/api/applications/${application.id}`)
      expect(applicationResponse.status()).toBe(404)

      const profileResponse = await otherOrgPage.request.get(`/api/applications/${application.id}/recruitment-profile`)
      expect(profileResponse.status()).toBe(404)

      const historyResponse = await otherOrgPage.request.get(`/api/applications/${application.id}/history`)
      expect(historyResponse.status()).toBe(404)
    }
    finally {
      await context.close()
    }
  })
})
