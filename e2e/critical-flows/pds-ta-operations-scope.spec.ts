import { test, expect, declineAnalyticsConsent } from '../fixtures'

async function createRequirement(page: any, title: string) {
  const response = await page.request.post('/api/jobs', {
    data: {
      title,
      description: 'E2E requirement used to verify TA Operations team scope.',
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

test.describe('PDS TA Operations Team Scope', () => {
  test('recruitment administrators see team operational scope while member recruiters remain restricted to individual scope', async ({ authenticatedPage, browser }) => {
    const ownerPage = authenticatedPage
    const runId = Date.now()
    const jobA = await createRequirement(ownerPage, `PDS TA Ops A ${runId}`)
    const jobB = await createRequirement(ownerPage, `PDS TA Ops B ${runId}`)
    const unallocatedJob = await createRequirement(ownerPage, `PDS TA Ops Unallocated ${runId}`)

    const recruiterA = await createRecruiter(ownerPage, browser, 'TA Ops Recruiter A', runId)
    const recruiterB = await createRecruiter(ownerPage, browser, 'TA Ops Recruiter B', runId)

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

      const managementResponse = await ownerPage.request.get('/api/dashboard/management')
      expect(managementResponse.ok()).toBeTruthy()
      const management = await managementResponse.json()
      expect(management.summary.openRequirements).toBeGreaterThanOrEqual(3)
      expect(management.summary.unallocatedRequirements).toBeGreaterThanOrEqual(1)

      const requirementIds = management.requirements.map((row: any) => row.jobId)
      expect(requirementIds).toEqual(expect.arrayContaining([jobA.id, jobB.id, unallocatedJob.id]))

      const recruiterNames = management.recruiters.map((row: any) => row.recruiterName)
      expect(recruiterNames).toEqual(expect.arrayContaining([
        recruiterA.recruiter.name,
        recruiterB.recruiter.name,
        'Unallocated',
      ]))

      const taLeadResponse = await ownerPage.request.get('/api/dashboard/ta-lead-kpis')
      expect(taLeadResponse.ok()).toBeTruthy()
      const taLead = await taLeadResponse.json()
      expect(taLead.team).toEqual(expect.objectContaining({
        daily: expect.any(Object),
        average: expect.any(Object),
        windowTotals: expect.any(Object),
      }))
      expect(taLead.scopeNote).toContain('operational team view')
      expect(taLead.scopeNote).toContain('does not rank recruiters or candidates')

      await ownerPage.goto('/dashboard/ta-operations')
      await ownerPage.waitForLoadState('networkidle')
      await expect(ownerPage.getByTestId('ta-operations-dashboard')).toBeVisible()
      await expect(ownerPage.getByRole('heading', { name: 'TA Lead Command Centre' })).toBeVisible()
      await expect(ownerPage.getByTestId('ta-recruiter-performance-table')).toContainText(recruiterA.recruiter.name)
      await expect(ownerPage.getByTestId('ta-recruiter-performance-table')).toContainText(recruiterB.recruiter.name)
      await expect(ownerPage.getByTestId('ta-recruiter-performance-table')).toContainText('Unallocated')
      await expect(ownerPage.getByTestId('ta-recruiter-performance-table')).toContainText('This view does not rank recruiters')

      const memberManagementResponse = await recruiterA.page.request.get('/api/dashboard/management')
      expect(memberManagementResponse.status()).toBe(403)
      const memberTaLeadResponse = await recruiterA.page.request.get('/api/dashboard/ta-lead-kpis')
      expect(memberTaLeadResponse.status()).toBe(403)

      const memberScopeResponse = await recruiterA.page.request.get('/api/recruitment-scope')
      expect(memberScopeResponse.ok()).toBeTruthy()
      const memberScope = await memberScopeResponse.json()
      expect(memberScope.allocatedOnly).toBe(true)
      expect(memberScope.canManageRequirements).toBe(false)

      await recruiterA.page.goto('/dashboard/ta-operations')
      await recruiterA.page.waitForLoadState('networkidle')
      await expect(recruiterA.page.getByText('TA operations unavailable')).toBeVisible()
      await expect(recruiterA.page.getByText('This operational team view is restricted to recruitment administrators and owners.')).toBeVisible()
    }
    finally {
      await recruiterA.context.close()
      await recruiterB.context.close()
    }
  })
})
