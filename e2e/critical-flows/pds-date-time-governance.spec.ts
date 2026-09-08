import { test, expect } from '../fixtures'

function toDateInput(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dmy(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

test.describe('PDS Date and Time Governance', () => {
  test('critical recruitment dates respect the organization date format consistently', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    const runId = Date.now()

    const settingsResponse = await page.request.get('/api/org-settings')
    expect(settingsResponse.ok()).toBeTruthy()
    const originalSettings = await settingsResponse.json()
    const originalDateFormat = originalSettings.dateFormat ?? 'mdy'

    try {
      const updateSettingsResponse = await page.request.patch('/api/org-settings', {
        data: { dateFormat: 'dmy' },
      })
      expect(updateSettingsResponse.ok()).toBeTruthy()

      const createResponse = await page.request.post('/api/jobs', {
        data: {
          title: `PDS Date Governance ${runId}`,
          description: 'E2E requirement used to verify consistent organization-aware date rendering.',
          location: 'Noida',
          type: 'full_time',
          status: 'open',
          questions: [],
          criteria: [],
        },
      })
      expect(createResponse.status()).toBe(201)
      const job = await createResponse.json()

      const allocationsResponse = await page.request.get('/api/requirement-allocations')
      expect(allocationsResponse.ok()).toBeTruthy()
      const allocations = await allocationsResponse.json()
      const owner = allocations.members.find((member: any) => member.role === 'owner')
      expect(owner?.userId).toBeTruthy()

      await page.goto('/dashboard/requirement-allocations')
      await page.waitForLoadState('networkidle')
      const row = page.locator('tbody tr').filter({ hasText: job.title })
      await expect(row).toHaveCount(1)

      const assignmentValue = '2026-09-07'
      const targetValue = '2026-11-06'
      const recruiterSelect = row.locator('select')
      const assignmentInput = row.locator('input[type="date"]').nth(0)
      const targetClosureInput = row.locator('input[type="date"]').nth(1)

      await recruiterSelect.selectOption(owner.userId)
      await assignmentInput.fill(assignmentValue)
      await assignmentInput.dispatchEvent('change')
      await targetClosureInput.fill(targetValue)
      await targetClosureInput.dispatchEvent('change')

      await Promise.all([
        page.waitForResponse(response => response.url().includes(`/api/requirement-allocations/${job.id}`) && response.request().method() === 'PUT' && response.ok()),
        row.getByRole('button', { name: 'Save' }).click(),
      ])

      await page.goto('/dashboard/jobs')
      await page.waitForLoadState('networkidle')
      const requirementRow = page.getByRole('link').filter({ hasText: job.title }).first()
      await expect(requirementRow).toBeVisible()
      await expect(requirementRow).toContainText(`Created ${dmy(job.createdAt)}`)

      await page.goto(`/dashboard/jobs/${job.id}`)
      await page.waitForLoadState('networkidle')
      await expect(page.getByTestId('requirement-command-centre')).toBeVisible()
      await expect(page.getByText(`TAT started ${dmy(new Date(`${assignmentValue}T00:00:00`))}`, { exact: true })).toBeVisible()
      await expect(page.getByText(`Target ${dmy(new Date(`${targetValue}T00:00:00`))}`, { exact: true })).toBeVisible()

      const savedSettingsResponse = await page.request.get('/api/org-settings')
      expect(savedSettingsResponse.ok()).toBeTruthy()
      const savedSettings = await savedSettingsResponse.json()
      expect(savedSettings.dateFormat).toBe('dmy')
    }
    finally {
      await page.request.patch('/api/org-settings', {
        data: { dateFormat: originalDateFormat },
      })
    }
  })
})
