import { test, expect } from '../fixtures'

test.describe('PDS Navigation Governance', () => {
  test('requirement tabs preserve requirement context', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    const runId = Date.now()
    const response = await page.request.post('/api/jobs', {
      data: {
        title: `PDS Navigation ${runId}`,
        description: 'E2E navigation requirement.',
        location: 'Noida',
        type: 'full_time',
        status: 'open',
        questions: [],
        criteria: [],
      },
    })
    expect(response.status()).toBe(201)
    const requirement = await response.json()

    await page.goto(`/dashboard/jobs/${requirement.id}`)
    await expect(page.getByTestId('requirement-command-centre')).toBeVisible()
    await expect(page.getByRole('heading', { name: requirement.title, exact: true })).toBeVisible()

    const tabs = [
      ['requirement-tab-overview', `/dashboard/jobs/${requirement.id}`],
      ['requirement-tab-pipeline', `/dashboard/jobs/${requirement.id}/candidates`],
      ['requirement-tab-jd-skill-matrix', `/dashboard/jobs/${requirement.id}/ai-analysis`],
      ['requirement-tab-candidate-match', `/dashboard/jobs/${requirement.id}/pds-ranking`],
      ['requirement-tab-candidate-register', `/dashboard/jobs/${requirement.id}/pds-register`],
      ['requirement-tab-requirement-settings', `/dashboard/jobs/${requirement.id}/settings`],
    ] as const

    for (const [testId, path] of tabs) {
      await expect(page.getByTestId(testId)).toHaveAttribute('href', path)
    }

    await page.getByTestId('requirement-tab-pipeline').click()
    await page.waitForURL(url => url.pathname === `/dashboard/jobs/${requirement.id}/candidates`)
    await expect(page.getByRole('heading', { name: requirement.title, exact: true })).toBeVisible()

    await page.getByTestId('requirement-tab-overview').click()
    await page.waitForURL(url => url.pathname === `/dashboard/jobs/${requirement.id}`)
    await expect(page.getByTestId('requirement-command-centre')).toBeVisible()

    await page.getByTestId('requirement-tab-all').click()
    await page.waitForURL(url => url.pathname === '/dashboard/jobs')
    await expect(page.getByRole('heading', { name: requirement.title, exact: true })).toBeVisible()
  })
})
