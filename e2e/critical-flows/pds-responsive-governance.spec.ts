import { test, expect } from '../fixtures'

async function expectNoPageOverflow(page: any) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.viewport + 1)
}

test.describe('PDS Responsive Governance', () => {
  test('critical recruiter surfaces remain usable on a mobile viewport', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    const runId = Date.now()
    await page.setViewportSize({ width: 390, height: 844 })

    const jobResponse = await page.request.post('/api/jobs', {
      data: {
        title: `PDS Mobile ${runId}`,
        description: 'E2E requirement used to verify mobile recruiter usability.',
        location: 'Noida',
        type: 'full_time',
        status: 'open',
        questions: [],
        criteria: [],
      },
    })
    expect(jobResponse.status()).toBe(201)
    const job = await jobResponse.json()

    const candidateResponse = await page.request.post('/api/candidates', {
      data: {
        firstName: 'Mobile',
        lastName: 'Candidate',
        email: `mobile-candidate-${runId}@test.local`,
        phone: '+919999991144',
      },
    })
    expect(candidateResponse.status()).toBe(201)
    const candidate = await candidateResponse.json()

    const applicationResponse = await page.request.post('/api/applications', {
      data: { candidateId: candidate.id, jobId: job.id },
    })
    expect(applicationResponse.status()).toBe(201)

    await page.goto('/dashboard/jobs')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(job.title, { exact: true })).toBeVisible()
    await expectNoPageOverflow(page)

    await page.goto(`/dashboard/jobs/${job.id}`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('requirement-command-centre')).toBeVisible()
    await expect(page.getByTestId('requirement-tab-ribbon')).toBeVisible()
    await expectNoPageOverflow(page)

    await page.goto(`/dashboard/jobs/${job.id}/candidates`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('requirement-tab-ribbon')).toBeVisible()
    await expect(page.getByText(candidate.email, { exact: true })).toBeVisible()
    await expectNoPageOverflow(page)

    await page.getByText(candidate.email, { exact: true }).click()
    const workspace = page.getByTestId('pds-recruiter-candidate-workspace')
    await expect(workspace).toBeVisible()

    const workspaceBox = await workspace.boundingBox()
    expect(workspaceBox).toBeTruthy()
    expect(workspaceBox!.x).toBeGreaterThanOrEqual(0)
    expect(workspaceBox!.width).toBeLessThanOrEqual(390)
    await expect(workspace.getByTitle('Close')).toBeVisible()

    await workspace.getByTitle('Close').click()
    await expect(workspace).toBeHidden()
  })
})
