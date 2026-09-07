import { test, expect, declineAnalyticsConsent } from '../fixtures'

function toDateInput(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function plusDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00`)
  date.setDate(date.getDate() + days)
  return toDateInput(date)
}

test.describe('PDS Recruitment Governance', () => {
  test('admin allocation starts TAT only from assignment date and defaults target closure to +60 days', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    const title = `PDS Governance ${Date.now()}`

    const scopeResponse = await page.request.get('/api/recruitment-scope')
    expect(scopeResponse.ok()).toBeTruthy()
    const scope = await scopeResponse.json()
    expect(scope.canManageRequirements).toBe(true)
    expect(scope.allocatedOnly).toBe(false)

    const createResponse = await page.request.post('/api/jobs', {
      data: {
        title,
        description: 'E2E requirement used to verify PDS allocation and TAT governance.',
        location: 'Noida',
        type: 'full_time',
        status: 'open',
        questions: [],
        criteria: [],
      },
    })
    expect(createResponse.status()).toBe(201)
    const createdJob = await createResponse.json()

    const initialAllocationResponse = await page.request.get('/api/requirement-allocations')
    expect(initialAllocationResponse.ok()).toBeTruthy()
    const initialAllocationData = await initialAllocationResponse.json()
    const initialRow = initialAllocationData.requirements.find((row: any) => row.jobId === createdJob.id)

    expect(initialRow).toBeTruthy()
    expect(initialRow.ownerUserId).toBeNull()
    expect(initialRow.assignmentDate).toBeNull()
    expect(initialRow.targetClosureDate).toBeNull()
    expect(initialAllocationData.summary.unallocated).toBeGreaterThanOrEqual(1)

    const owner = initialAllocationData.members.find((member: any) => member.role === 'owner')
    expect(owner?.userId).toBeTruthy()

    await page.goto('/dashboard/requirement-allocations')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: 'Requirement Allocation' })).toBeVisible()

    const row = page.locator('tbody tr').filter({ hasText: title })
    await expect(row).toHaveCount(1)

    const recruiterSelect = row.locator('select')
    const assignmentInput = row.locator('input[type="date"]').nth(0)
    const targetClosureInput = row.locator('input[type="date"]').nth(1)

    await expect(recruiterSelect).toHaveValue('')
    await expect(assignmentInput).toBeDisabled()
    await expect(assignmentInput).toHaveValue('')
    await expect(targetClosureInput).toHaveValue('')

    await recruiterSelect.selectOption(owner.userId)
    await expect(assignmentInput).toBeEnabled()
    await expect(assignmentInput).not.toHaveValue('')

    const assignmentDate = new Date()
    assignmentDate.setDate(assignmentDate.getDate() - 1)
    const assignmentValue = toDateInput(assignmentDate)
    const expectedTarget = plusDays(assignmentValue, 60)

    await assignmentInput.fill(assignmentValue)
    await assignmentInput.dispatchEvent('change')
    await expect(targetClosureInput).toHaveValue(expectedTarget)

    await Promise.all([
      page.waitForResponse(response => response.url().includes(`/api/requirement-allocations/${createdJob.id}`) && response.request().method() === 'PUT' && response.ok()),
      row.getByRole('button', { name: 'Save' }).click(),
    ])

    await expect(page.getByText('Requirement allocation updated')).toBeVisible()

    const savedAllocationResponse = await page.request.get('/api/requirement-allocations')
    expect(savedAllocationResponse.ok()).toBeTruthy()
    const savedAllocationData = await savedAllocationResponse.json()
    const savedRow = savedAllocationData.requirements.find((item: any) => item.jobId === createdJob.id)

    expect(savedRow.ownerUserId).toBe(owner.userId)
    expect(toDateInput(new Date(savedRow.assignmentDate))).toBe(assignmentValue)
    expect(toDateInput(new Date(savedRow.targetClosureDate))).toBe(expectedTarget)
    expect(new Date(savedRow.assignmentDate).getTime()).not.toBe(new Date(createdJob.createdAt).getTime())
  })

  test('member recruiter sees only allocated requirements and cannot use allocation administration', async ({ authenticatedPage, browser }) => {
    const ownerPage = authenticatedPage
    const runId = Date.now()
    const recruiter = {
      name: `PDS Recruiter ${runId}`,
      email: `pds-recruiter-${runId}@test.local`,
      password: process.env.E2E_TEST_PASSWORD || 'TestPassword123!',
    }

    const createRequirement = async (title: string) => {
      const response = await ownerPage.request.post('/api/jobs', {
        data: {
          title,
          description: 'E2E requirement used to verify recruiter allocation visibility.',
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

    const allocatedJob = await createRequirement(`PDS Allocated ${runId}`)
    const hiddenJob = await createRequirement(`PDS Hidden ${runId}`)

    const inviteResponse = await ownerPage.request.post('/api/invite-links', {
      data: { role: 'member', maxUses: 1, expiresInHours: 1 },
    })
    expect(inviteResponse.status()).toBe(201)
    const invite = await inviteResponse.json()
    expect(invite.token).toBeTruthy()

    const recruiterContext = await browser.newContext()
    await declineAnalyticsConsent(recruiterContext)
    const recruiterPage = await recruiterContext.newPage()

    try {
      await recruiterPage.goto('/auth/sign-up')
      await recruiterPage.waitForLoadState('networkidle')
      await recruiterPage.getByLabel('Name').fill(recruiter.name)
      await recruiterPage.getByLabel('Email').fill(recruiter.email)
      await recruiterPage.getByLabel('Password', { exact: true }).fill(recruiter.password)
      await recruiterPage.getByLabel('Confirm password').fill(recruiter.password)

      await Promise.all([
        recruiterPage.waitForResponse(response => response.url().includes('/api/auth/sign-up') && response.status() === 200),
        recruiterPage.getByRole('button', { name: 'Sign up' }).click(),
      ])

      await recruiterPage.goto(`/join/${invite.token}`)
      await recruiterPage.waitForLoadState('networkidle')
      await expect(recruiterPage.getByRole('heading', { name: 'Join organization' })).toBeVisible()
      await expect(recruiterPage.getByText('Join as', { exact: false })).toContainText('Member')

      await Promise.all([
        recruiterPage.waitForResponse(response => response.url().includes('/api/invite-links/accept') && response.status() === 200),
        recruiterPage.getByRole('button', { name: /Join / }).click(),
      ])
      await expect(recruiterPage.getByRole('heading', { name: "You're in!" })).toBeVisible()
      await recruiterPage.waitForURL(url => url.pathname.includes('/dashboard'), { timeout: 10_000 })
      await recruiterPage.waitForLoadState('networkidle')

      const allocationResponse = await ownerPage.request.get('/api/requirement-allocations')
      expect(allocationResponse.ok()).toBeTruthy()
      const allocationData = await allocationResponse.json()
      const member = allocationData.members.find((person: any) => person.email === recruiter.email)
      expect(member?.userId).toBeTruthy()
      expect(member.role).toBe('member')

      const assignResponse = await ownerPage.request.put(`/api/requirement-allocations/${allocatedJob.id}`, {
        data: { ownerUserId: member.userId },
      })
      expect(assignResponse.ok()).toBeTruthy()

      const recruiterScopeResponse = await recruiterPage.request.get('/api/recruitment-scope')
      expect(recruiterScopeResponse.ok()).toBeTruthy()
      const recruiterScope = await recruiterScopeResponse.json()
      expect(recruiterScope.role).toBe('member')
      expect(recruiterScope.canManageRequirements).toBe(false)
      expect(recruiterScope.allocatedOnly).toBe(true)

      const visibleJobsResponse = await recruiterPage.request.get('/api/jobs?limit=100')
      expect(visibleJobsResponse.ok()).toBeTruthy()
      const visibleJobs = await visibleJobsResponse.json()
      expect(visibleJobs.data.map((job: any) => job.id)).toEqual([allocatedJob.id])

      const allocatedDetailResponse = await recruiterPage.request.get(`/api/jobs/${allocatedJob.id}`)
      expect(allocatedDetailResponse.ok()).toBeTruthy()

      const hiddenDetailResponse = await recruiterPage.request.get(`/api/jobs/${hiddenJob.id}`)
      expect(hiddenDetailResponse.status()).toBe(404)

      const allocationAdminResponse = await recruiterPage.request.get('/api/requirement-allocations')
      expect(allocationAdminResponse.status()).toBe(403)

      await recruiterPage.goto('/dashboard/requirement-allocations')
      await recruiterPage.waitForLoadState('networkidle')
      await expect(recruiterPage.getByText('You do not have access to requirement allocation, or the page could not be loaded.')).toBeVisible()
    }
    finally {
      await recruiterContext.close()
    }
  })
})
