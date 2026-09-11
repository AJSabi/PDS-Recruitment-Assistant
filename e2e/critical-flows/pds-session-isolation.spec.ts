import { test, expect, declineAnalyticsConsent } from '../fixtures'

async function createRequirement(page: any, title: string) {
  const response = await page.request.post('/api/jobs', {
    data: {
      title,
      description: 'E2E requirement used to verify recruiter session isolation.',
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

async function createCandidateApplication(page: any, jobId: string, label: string, runId: number) {
  const candidateResponse = await page.request.post('/api/candidates', {
    data: {
      firstName: label,
      lastName: `Candidate${runId}`,
      email: `${label.toLowerCase()}-session-${runId}@test.local`,
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

async function createRecruiter(ownerPage: any, browser: any, recruiter: { name: string, email: string, password: string }) {
  const inviteResponse = await ownerPage.request.post('/api/invite-links', {
    data: { role: 'member', maxUses: 1, expiresInHours: 1 },
  })
  expect(inviteResponse.status()).toBe(201)
  const invite = await inviteResponse.json()

  const context = await browser.newContext()
  await declineAnalyticsConsent(context)
  const page = await context.newPage()

  try {
    await page.goto('/auth/sign-up')
    await page.waitForLoadState('networkidle')
    await page.getByLabel('Name').fill(recruiter.name)
    await page.getByLabel('Email').fill(recruiter.email)
    await page.getByLabel('Password', { exact: true }).fill(recruiter.password)
    await page.getByLabel('Confirm password').fill(recruiter.password)
    await Promise.all([
      page.waitForResponse(response => response.url().includes('/api/auth/sign-up') && response.status() === 200),
      page.getByRole('button', { name: 'Sign up' }).click(),
    ])

    await page.goto(`/join/${invite.token}`)
    await page.waitForLoadState('networkidle')
    await Promise.all([
      page.waitForResponse(response => response.url().includes('/api/invite-links/accept') && response.status() === 200),
      page.getByRole('button', { name: /Join / }).click(),
    ])
    await page.waitForURL(url => url.pathname.includes('/dashboard'), { timeout: 10_000 })
  }
  finally {
    await context.close()
  }

  const allocationResponse = await ownerPage.request.get('/api/requirement-allocations')
  expect(allocationResponse.ok()).toBeTruthy()
  const allocationData = await allocationResponse.json()
  const member = allocationData.members.find((person: any) => person.email === recruiter.email)
  expect(member?.userId).toBeTruthy()
  expect(member.role).toBe('member')
  return member
}

async function signIn(page: any, recruiter: { email: string, password: string }) {
  await page.goto('/auth/sign-in')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Email').fill(recruiter.email)
  await page.getByLabel('Password').fill(recruiter.password)
  await Promise.all([
    page.waitForURL(url => url.pathname.includes('/dashboard'), { timeout: 10_000 }),
    page.getByRole('button', { name: /^Sign in$/i }).click(),
  ])
  await page.waitForLoadState('networkidle')
}

async function signOutFromTopBar(page: any, initials: string) {
  const userButton = page.locator('header button').filter({ hasText: initials }).first()
  await expect(userButton).toBeVisible()
  await userButton.click()
  const signOutButton = page.getByRole('button', { name: 'Sign out' })
  await expect(signOutButton).toBeVisible()
  await Promise.all([
    page.waitForURL(url => url.pathname.includes('/auth/sign-in'), { timeout: 10_000 }),
    signOutButton.click(),
  ])
  await page.waitForLoadState('networkidle')
}

test.describe('PDS Recruiter Session Isolation', () => {
  test('sign-out clears recruiter A state before recruiter B signs in within the same browser context', async ({ authenticatedPage, browser }) => {
    const ownerPage = authenticatedPage
    const runId = Date.now()
    const password = process.env.E2E_TEST_PASSWORD || 'TestPassword123!'
    const recruiterA = {
      name: `Recruiter Alpha ${runId}`,
      email: `recruiter-alpha-${runId}@test.local`,
      password,
    }
    const recruiterB = {
      name: `Recruiter Beta ${runId}`,
      email: `recruiter-beta-${runId}@test.local`,
      password,
    }

    const jobA = await createRequirement(ownerPage, `PDS Session Alpha ${runId}`)
    const jobB = await createRequirement(ownerPage, `PDS Session Beta ${runId}`)
    const appA = await createCandidateApplication(ownerPage, jobA.id, 'Alpha', runId)
    const appB = await createCandidateApplication(ownerPage, jobB.id, 'Beta', runId)

    const memberA = await createRecruiter(ownerPage, browser, recruiterA)
    const memberB = await createRecruiter(ownerPage, browser, recruiterB)

    const assignAResponse = await ownerPage.request.put(`/api/requirement-allocations/${jobA.id}`, {
      data: { ownerUserId: memberA.userId },
    })
    expect(assignAResponse.ok()).toBeTruthy()
    const assignBResponse = await ownerPage.request.put(`/api/requirement-allocations/${jobB.id}`, {
      data: { ownerUserId: memberB.userId },
    })
    expect(assignBResponse.ok()).toBeTruthy()

    const context = await browser.newContext()
    await declineAnalyticsConsent(context)
    const page = await context.newPage()

    try {
      await signIn(page, recruiterA)

      const scopeAResponse = await page.request.get('/api/recruitment-scope')
      expect(scopeAResponse.ok()).toBeTruthy()
      const scopeA = await scopeAResponse.json()
      expect(scopeA.role).toBe('member')
      expect(scopeA.allocatedOnly).toBe(true)

      await page.goto('/dashboard/jobs')
      await page.waitForLoadState('networkidle')
      await expect(page.getByText(jobA.title, { exact: true })).toBeVisible()
      await expect(page.getByText(jobB.title, { exact: true })).toHaveCount(0)

      const profileAResponse = await page.request.get(`/api/applications/${appA.application.id}/recruitment-profile`)
      expect(profileAResponse.ok()).toBeTruthy()

      const conversationAResponse = await page.request.post('/api/chatbot/conversations', {
        data: { scope: { kind: 'job', jobId: jobA.id } },
      })
      expect(conversationAResponse.status()).toBe(200)
      const conversationA = (await conversationAResponse.json()).conversation
      expect(conversationA.scope).toEqual({ kind: 'job', jobId: jobA.id })

      await page.goto(`/dashboard/jobs/${jobA.id}/candidates`)
      await page.waitForLoadState('networkidle')
      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')
      await expect(page.getByRole('heading', { name: 'My Recruitment Command Centre' })).toBeVisible()

      await signOutFromTopBar(page, 'RA')
      await expect(page.getByRole('heading', { name: 'Sign in to your account' })).toBeVisible()

      await signIn(page, recruiterB)

      const scopeBResponse = await page.request.get('/api/recruitment-scope')
      expect(scopeBResponse.ok()).toBeTruthy()
      const scopeB = await scopeBResponse.json()
      expect(scopeB.role).toBe('member')
      expect(scopeB.allocatedOnly).toBe(true)

      const jobsBResponse = await page.request.get('/api/jobs?limit=100')
      expect(jobsBResponse.ok()).toBeTruthy()
      const jobsB = await jobsBResponse.json()
      expect(jobsB.data.map((job: any) => job.id)).toEqual([jobB.id])

      const oldJobResponse = await page.request.get(`/api/jobs/${jobA.id}`)
      expect(oldJobResponse.status()).toBe(404)
      const ownJobResponse = await page.request.get(`/api/jobs/${jobB.id}`)
      expect(ownJobResponse.ok()).toBeTruthy()

      const oldApplicationResponse = await page.request.get(`/api/applications/${appA.application.id}/recruitment-profile`)
      expect(oldApplicationResponse.status()).toBe(404)
      const ownApplicationResponse = await page.request.get(`/api/applications/${appB.application.id}/recruitment-profile`)
      expect(ownApplicationResponse.ok()).toBeTruthy()

      const oldConversationResponse = await page.request.get(`/api/chatbot/conversations/${conversationA.id}`)
      expect(oldConversationResponse.status()).toBe(404)

      await page.goto('/dashboard/jobs')
      await page.waitForLoadState('networkidle')
      await expect(page.getByText(jobB.title, { exact: true })).toBeVisible()
      await expect(page.getByText(jobA.title, { exact: true })).toHaveCount(0)

      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')
      await expect(page.getByRole('heading', { name: 'My Recruitment Command Centre' })).toBeVisible()
      await expect(page.getByText(jobA.title, { exact: true })).toHaveCount(0)
    }
    finally {
      await context.close()
    }
  })
})
