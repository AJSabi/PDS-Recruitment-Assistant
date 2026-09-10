import { test, expect, declineAnalyticsConsent } from '../fixtures'

async function createRequirement(page: any, title: string) {
  const response = await page.request.post('/api/jobs', {
    data: {
      title,
      description: 'E2E requirement used to verify the shared recruiter analytics filter.',
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

async function createRecruiter(ownerPage: any, browser: any, runId: number) {
  const recruiter = {
    name: `Shared Filter Recruiter ${runId}`,
    email: `shared-filter-recruiter-${runId}@test.local`,
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

  return { recruiter, context }
}

test.describe('PDS shared recruiter analytics filter', () => {
  test('privileged recruiter selection propagates to source and cycle analytics', async ({ authenticatedPage, browser }) => {
    const ownerPage = authenticatedPage
    const runId = Date.now()
    const requirement = await createRequirement(ownerPage, `PDS Shared Filter ${runId}`)
    const recruitedUser = await createRecruiter(ownerPage, browser, runId)

    try {
      const allocationsResponse = await ownerPage.request.get('/api/requirement-allocations')
      expect(allocationsResponse.ok()).toBeTruthy()
      const allocations = await allocationsResponse.json()
      const member = allocations.members.find((person: any) => person.email === recruitedUser.recruiter.email)
      expect(member?.userId).toBeTruthy()

      const allocationResponse = await ownerPage.request.put(`/api/requirement-allocations/${requirement.id}`, {
        data: { ownerUserId: member.userId },
      })
      expect(allocationResponse.ok()).toBeTruthy()

      await ownerPage.goto('/dashboard')
      await ownerPage.waitForLoadState('networkidle')

      const recruiterSelect = ownerPage.getByRole('combobox', { name: 'Recruiter' })
      await expect(recruiterSelect).toBeVisible()
      await expect(recruiterSelect.locator(`option[value="${member.userId}"]`)).toHaveCount(1)

      const sourceRequest = ownerPage.waitForRequest((request) => {
        const url = new URL(request.url())
        return url.pathname === '/api/dashboard/source-analytics' && url.searchParams.get('recruiterId') === member.userId
      })
      const cycleRequest = ownerPage.waitForRequest((request) => {
        const url = new URL(request.url())
        return url.pathname === '/api/dashboard/cycle-time' && url.searchParams.get('recruiterId') === member.userId
      })

      await recruiterSelect.selectOption(member.userId)
      await Promise.all([sourceRequest, cycleRequest])

      const filteredSource = await ownerPage.request.get(`/api/dashboard/source-analytics?period=90&recruiterId=${member.userId}`)
      const filteredCycle = await ownerPage.request.get(`/api/dashboard/cycle-time?period=90&metric=allocation_to_offer&recruiterId=${member.userId}`)
      expect(filteredSource.ok()).toBeTruthy()
      expect(filteredCycle.ok()).toBeTruthy()
      expect((await filteredSource.json()).note).toContain('selected recruiter')
      expect((await filteredCycle.json()).note).toContain('selected recruiter')

      const sourceResetRequest = ownerPage.waitForRequest((request) => {
        const url = new URL(request.url())
        return url.pathname === '/api/dashboard/source-analytics' && !url.searchParams.has('recruiterId')
      })
      const cycleResetRequest = ownerPage.waitForRequest((request) => {
        const url = new URL(request.url())
        return url.pathname === '/api/dashboard/cycle-time' && !url.searchParams.has('recruiterId')
      })

      await recruiterSelect.selectOption('')
      await Promise.all([sourceResetRequest, cycleResetRequest])
    }
    finally {
      await recruitedUser.context.close()
    }
  })
})
