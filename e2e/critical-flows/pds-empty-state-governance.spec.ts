import { test, expect } from '../fixtures'

async function createRequirement(page: any, title: string) {
  const response = await page.request.post('/api/jobs', {
    data: {
      title,
      description: 'E2E requirement used to verify PDS-specific empty states.',
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

test.describe('PDS Empty State Governance', () => {
  test('empty recruiter surfaces use clear PDS-specific guidance instead of generic ATS placeholders', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    await page.goto('/dashboard/jobs')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: 'Recruitment Requirements' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'No requirements yet' })).toBeVisible()
    await expect(page.getByText('Create the first requirement to start recruitment.')).toBeVisible()
    await expect(page.getByText(/no data available/i)).toHaveCount(0)
    await expect(page.getByText(/no records found/i)).toHaveCount(0)

    await page.goto('/dashboard/pds-candidates')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: 'Candidate Database' })).toBeVisible()
    await expect(page.getByText('No candidates in the central database yet')).toBeVisible()
    await expect(page.getByText('Candidates created inside a requirement or imported from resumes will appear here automatically.')).toBeVisible()
    await expect(page.getByText(/no data available/i)).toHaveCount(0)
    await expect(page.getByText(/no records found/i)).toHaveCount(0)

    const requirement = await createRequirement(page, `PDS Empty State ${Date.now()}`)

    await page.goto(`/dashboard/jobs/${requirement.id}/candidates`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('No candidates yet')).toBeVisible()
    await expect(page.getByText('Candidates will appear here after they apply or are linked to this requirement.')).toBeVisible()
    await expect(page.getByText(/no applications/i)).toHaveCount(0)
    await expect(page.getByText(/no data available/i)).toHaveCount(0)
  })
})
