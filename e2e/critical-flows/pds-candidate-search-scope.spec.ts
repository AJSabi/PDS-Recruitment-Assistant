import { test, expect, declineAnalyticsConsent } from '../fixtures'

async function createRequirement(page: any, title: string) {
  const response = await page.request.post('/api/jobs', {
    data: {
      title,
      description: 'E2E requirement used to verify candidate search allocation scope.',
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

async function createCandidate(page: any, label: string, runId: number) {
  const response = await page.request.post('/api/candidates', {
    data: {
      firstName: label,
      lastName: `Scope${runId}`,
      email: `${label.toLowerCase().replace(/\s+/g, '-')}-${runId}@test.local`,
      phone: `9${String(runId).slice(-9).padStart(9, '0')}`,
    },
  })
  expect(response.status()).toBe(201)
  return response.json()
}

async function linkApplication(page: any, jobId: string, candidateId: string) {
  const response = await page.request.post('/api/applications', {
    data: { jobId, candidateId },
  })
  expect(response.status()).toBe(201)
  return response.json()
}

async function createRecruiter(ownerPage: any, browser: any, label: string, runId: number) {
  const recruiter = {
    name: `${label} ${runId}`,
    email: `${label.toLowerCase().replace(/\s+/g, '-')}-${runId}@test.local`,
    password: process.env.E2E_TEST_PASSWORD || 'TestPassword123!',
  }

  const inviteResponse = await ownerPage.request.post('/api/invite-links', {
    data: { role: 'member', maxUses: 1, expiresInHours: 1 },
  })
  expect(inviteResponse.status()).toBe(201)
  const invite = await inviteResponse.json()

  const context = await browser.newContext()
  await declineAnalyticsConsent(context)
  const page = await context.newPage()

  await page.goto('/auth/sign-up')
  await page.getByLabel('Name').fill(recruiter.name)
  await page.getByLabel('Email').fill(recruiter.email)
  await page.getByLabel('Password', { exact: true }).fill(recruiter.password)
  await page.getByLabel('Confirm password').fill(recruiter.password)
  await page.getByRole('button', { name: 'Sign up' }).click()
  await page.waitForURL(url => ['/onboarding/create-org', '/dashboard'].some(path => url.pathname.includes(path)), { timeout: 15_000 })

  await page.goto(`/join/${invite.token}`)
  await Promise.all([
    page.waitForResponse(response => response.url().includes('/api/invite-links/accept') && response.status() === 200),
    page.getByRole('button', { name: /Join / }).click(),
  ])
  await page.waitForURL(url => url.pathname.includes('/dashboard'), { timeout: 10_000 })

  return { recruiter, context, page }
}

test.describe('PDS Candidate Search Scope Governance', () => {
  test('recruiter candidate search and Candidate Database expose only candidates linked to allocated requirements', async ({ authenticatedPage, browser }) => {
    const ownerPage = authenticatedPage
    const runId = Date.now()
    const jobA = await createRequirement(ownerPage, `PDS Candidate Scope A ${runId}`)
    const jobB = await createRequirement(ownerPage, `PDS Candidate Scope B ${runId}`)

    const visibleCandidate = await createCandidate(ownerPage, 'VisibleCandidate', runId)
    const hiddenCandidate = await createCandidate(ownerPage, 'HiddenCandidate', runId)
    const sharedCandidate = await createCandidate(ownerPage, 'SharedCandidate', runId)

    await linkApplication(ownerPage, jobA.id, visibleCandidate.id)
    await linkApplication(ownerPage, jobB.id, hiddenCandidate.id)
    await linkApplication(ownerPage, jobA.id, sharedCandidate.id)
    await linkApplication(ownerPage, jobB.id, sharedCandidate.id)

    const recruiterA = await createRecruiter(ownerPage, browser, 'Candidate Scope Recruiter A', runId)
    const recruiterB = await createRecruiter(ownerPage, browser, 'Candidate Scope Recruiter B', runId)

    try {
      const allocationsResponse = await ownerPage.request.get('/api/requirement-allocations')
      expect(allocationsResponse.ok()).toBeTruthy()
      const allocations = await allocationsResponse.json()
      const memberA = allocations.members.find((person: any) => person.email === recruiterA.recruiter.email)
      const memberB = allocations.members.find((person: any) => person.email === recruiterB.recruiter.email)
      expect(memberA?.userId).toBeTruthy()
      expect(memberB?.userId).toBeTruthy()

      expect((await ownerPage.request.put(`/api/requirement-allocations/${jobA.id}`, { data: { ownerUserId: memberA.userId } })).ok()).toBeTruthy()
      expect((await ownerPage.request.put(`/api/requirement-allocations/${jobB.id}`, { data: { ownerUserId: memberB.userId } })).ok()).toBeTruthy()

      const listAResponse = await recruiterA.page.request.get('/api/candidates?limit=100')
      expect(listAResponse.ok()).toBeTruthy()
      const listA = await listAResponse.json()
      expect(new Set(listA.data.map((row: any) => row.id))).toEqual(new Set([visibleCandidate.id, sharedCandidate.id]))
      expect(listA.total).toBe(2)

      const hiddenSearchResponse = await recruiterA.page.request.get(`/api/candidates?limit=100&search=${encodeURIComponent(hiddenCandidate.email)}`)
      expect(hiddenSearchResponse.ok()).toBeTruthy()
      const hiddenSearch = await hiddenSearchResponse.json()
      expect(hiddenSearch.data).toEqual([])
      expect(hiddenSearch.total).toBe(0)

      const sharedSearchResponse = await recruiterA.page.request.get(`/api/candidates?limit=100&search=${encodeURIComponent(sharedCandidate.email)}`)
      expect(sharedSearchResponse.ok()).toBeTruthy()
      const sharedSearch = await sharedSearchResponse.json()
      expect(sharedSearch.data).toHaveLength(1)
      expect(sharedSearch.data[0].id).toBe(sharedCandidate.id)
      expect(sharedSearch.data[0].applicationCount).toBe(1)

      const databaseAResponse = await recruiterA.page.request.get('/api/pds/candidate-database')
      expect(databaseAResponse.ok()).toBeTruthy()
      const databaseA = await databaseAResponse.json()
      expect(new Set(databaseA.candidates.map((row: any) => row.candidateId))).toEqual(new Set([visibleCandidate.id, sharedCandidate.id]))
      expect(databaseA.summary.totalCandidates).toBe(2)
      expect(databaseA.candidates.some((row: any) => row.candidateId === hiddenCandidate.id)).toBe(false)

      const sharedA = databaseA.candidates.find((row: any) => row.candidateId === sharedCandidate.id)
      expect(sharedA.requirements).toHaveLength(1)
      expect(sharedA.requirements[0].jobId).toBe(jobA.id)
      expect(sharedA.requirements.some((row: any) => row.jobId === jobB.id)).toBe(false)

      const databaseBResponse = await recruiterB.page.request.get('/api/pds/candidate-database')
      expect(databaseBResponse.ok()).toBeTruthy()
      const databaseB = await databaseBResponse.json()
      expect(new Set(databaseB.candidates.map((row: any) => row.candidateId))).toEqual(new Set([hiddenCandidate.id, sharedCandidate.id]))
      const sharedB = databaseB.candidates.find((row: any) => row.candidateId === sharedCandidate.id)
      expect(sharedB.requirements).toHaveLength(1)
      expect(sharedB.requirements[0].jobId).toBe(jobB.id)

      await recruiterA.page.goto('/dashboard/pds-candidates')
      await recruiterA.page.waitForLoadState('networkidle')
      const table = recruiterA.page.getByTestId('candidate-database-desktop-table')
      await expect(table).toBeVisible()
      await expect(table.getByText(visibleCandidate.email)).toBeVisible()
      await expect(table.getByText(sharedCandidate.email)).toBeVisible()
      await expect(table.getByText(hiddenCandidate.email)).toHaveCount(0)

      const searchInput = recruiterA.page.getByPlaceholder('Search candidate, requirement, recruiter, status, fit or priority')
      await searchInput.fill(hiddenCandidate.email)
      await expect(table.getByText(hiddenCandidate.email)).toHaveCount(0)
      await expect(recruiterA.page.getByText('No candidates match the current search or filter.')).toBeVisible()
    }
    finally {
      await recruiterA.context.close()
      await recruiterB.context.close()
    }
  })
})
