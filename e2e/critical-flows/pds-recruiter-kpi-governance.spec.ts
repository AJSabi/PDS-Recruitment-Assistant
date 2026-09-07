import { test, expect, declineAnalyticsConsent } from '../fixtures'

async function createRequirement(page: any, title: string) {
  const response = await page.request.post('/api/jobs', {
    data: {
      title,
      description: 'E2E requirement used to verify recruiter KPI governance.',
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

  return { recruiter, context, page }
}

function assertIndividualKpiShape(payload: any) {
  expect(Object.keys(payload).sort()).toEqual([
    'attributionNote',
    'average',
    'averageWindow',
    'daily',
    'date',
  ])
  expect(payload.averageWindow.days).toBe(30)
  expect(payload.daily).toEqual(expect.objectContaining({
    candidatesSourced: expect.any(Number),
    recruiterScreeningsCompleted: expect.any(Number),
    interviewsScheduled: expect.any(Number),
    interviewsCompleted: expect.any(Number),
    offersRaised: expect.any(Number),
    offersAccepted: expect.any(Number),
    joined: expect.any(Number),
  }))
  expect(payload.average).toEqual(expect.objectContaining({
    candidatesSourced: expect.any(Number),
    recruiterScreeningsCompleted: expect.any(Number),
    interviewsScheduled: expect.any(Number),
    interviewsCompleted: expect.any(Number),
    offersRaised: expect.any(Number),
    offersAccepted: expect.any(Number),
    joined: expect.any(Number),
  }))

  const serialized = JSON.stringify(payload).toLowerCase()
  for (const forbidden of ['leaderboard', 'ranking', 'rank', 'peer', 'teamaverage', 'team_average', 'members']) {
    expect(serialized).not.toContain(forbidden)
  }
}

test.describe('PDS Recruiter KPI Governance', () => {
  test('recruiter daily KPIs remain individual and do not expose leaderboard or peer-ranking semantics', async ({ authenticatedPage, browser }) => {
    const ownerPage = authenticatedPage
    const runId = Date.now()
    const jobA = await createRequirement(ownerPage, `PDS KPI Recruiter A ${runId}`)
    const jobB = await createRequirement(ownerPage, `PDS KPI Recruiter B ${runId}`)

    const recruiterA = await createRecruiter(ownerPage, browser, 'KPI Recruiter A', runId)
    const recruiterB = await createRecruiter(ownerPage, browser, 'KPI Recruiter B', runId)

    try {
      const allocationsResponse = await ownerPage.request.get('/api/requirement-allocations')
      expect(allocationsResponse.ok()).toBeTruthy()
      const allocations = await allocationsResponse.json()
      const memberA = allocations.members.find((person: any) => person.email === recruiterA.recruiter.email)
      const memberB = allocations.members.find((person: any) => person.email === recruiterB.recruiter.email)
      expect(memberA?.userId).toBeTruthy()
      expect(memberB?.userId).toBeTruthy()

      expect((await ownerPage.request.put(`/api/requirement-allocations/${jobA.id}`, {
        data: { ownerUserId: memberA.userId },
      })).ok()).toBeTruthy()
      expect((await ownerPage.request.put(`/api/requirement-allocations/${jobB.id}`, {
        data: { ownerUserId: memberB.userId },
      })).ok()).toBeTruthy()

      const scopeA = await recruiterA.page.request.get('/api/recruitment-scope')
      const scopeB = await recruiterB.page.request.get('/api/recruitment-scope')
      expect((await scopeA.json()).allocatedOnly).toBe(true)
      expect((await scopeB.json()).allocatedOnly).toBe(true)

      const jobsAResponse = await recruiterA.page.request.get('/api/jobs?limit=100')
      const jobsBResponse = await recruiterB.page.request.get('/api/jobs?limit=100')
      expect(jobsAResponse.ok()).toBeTruthy()
      expect(jobsBResponse.ok()).toBeTruthy()
      expect((await jobsAResponse.json()).data.map((job: any) => job.id)).toEqual([jobA.id])
      expect((await jobsBResponse.json()).data.map((job: any) => job.id)).toEqual([jobB.id])

      const kpiAResponse = await recruiterA.page.request.get('/api/dashboard/recruiter-daily-kpis')
      const kpiBResponse = await recruiterB.page.request.get('/api/dashboard/recruiter-daily-kpis')
      expect(kpiAResponse.ok()).toBeTruthy()
      expect(kpiBResponse.ok()).toBeTruthy()
      const kpiA = await kpiAResponse.json()
      const kpiB = await kpiBResponse.json()
      assertIndividualKpiShape(kpiA)
      assertIndividualKpiShape(kpiB)

      expect(kpiA.attributionNote).toContain('Recruiter activity is based on immutable recruitment evidence')
      expect(kpiB.attributionNote).toContain('Recruiter activity is based on immutable recruitment evidence')

      await recruiterA.page.goto('/dashboard')
      await recruiterA.page.waitForLoadState('networkidle')
      const pulse = recruiterA.page.getByTestId('recruiter-daily-performance-pulse')
      await expect(pulse).toBeVisible()
      await expect(pulse.getByRole('heading', { name: 'My Daily Recruitment Pulse' })).toBeVisible()
      await expect(pulse.getByText('Previous working day activity compared with your rolling 30-day daily average.')).toBeVisible()
      await expect(pulse.getByText('Top-of-funnel activity completed by you')).toBeVisible()
      await expect(pulse.getByText('Late-stage recruitment outcomes progressed by you')).toBeVisible()

      const pulseText = (await pulse.innerText()).toLowerCase()
      expect(pulseText).not.toMatch(/leaderboard|ranking|\brank\b|top recruiter|vs team|team average|peer comparison/)
      await expect(recruiterA.page.getByRole('link', { name: 'Recruitment Analytics' })).toHaveCount(0)
    }
    finally {
      await recruiterA.context.close()
      await recruiterB.context.close()
    }
  })
})
