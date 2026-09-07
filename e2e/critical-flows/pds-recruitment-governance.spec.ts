import { test, expect } from '../fixtures'

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
})
