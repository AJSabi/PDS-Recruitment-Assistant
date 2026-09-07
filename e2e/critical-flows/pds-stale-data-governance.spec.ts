import { test, expect } from '../fixtures'

async function createRequirement(page: any, title: string) {
  const response = await page.request.post('/api/jobs', {
    data: {
      title,
      description: 'E2E requirement used to verify stale-data governance.',
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
      lastName: `Candidate${runId}`,
      email: `${label.toLowerCase()}-${runId}@test.local`,
      phone: `7${String(runId).slice(-9).padStart(9, '0')}`,
    },
  })
  expect(response.status()).toBe(201)
  return response.json()
}

async function linkCandidate(page: any, jobId: string, candidateId: string) {
  const response = await page.request.post('/api/applications', {
    data: { jobId, candidateId },
  })
  expect(response.status()).toBe(201)
  return response.json()
}

test.describe('PDS Loading and Stale Data Governance', () => {
  test('switching candidate records clears the previous candidate before the next record finishes loading', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    const runId = Date.now()
    const requirement = await createRequirement(page, `PDS Stale Data ${runId}`)
    const candidateA = await createCandidate(page, 'Alpha', runId)
    const candidateB = await createCandidate(page, 'Bravo', runId + 1)
    const applicationA = await linkCandidate(page, requirement.id, candidateA.id)
    const applicationB = await linkCandidate(page, requirement.id, candidateB.id)

    await page.goto(`/dashboard/jobs/${requirement.id}/candidates`)
    await expect(page.getByTestId('candidate-pipeline-board')).toBeVisible()

    const alphaName = `Alpha Candidate${runId}`
    const bravoName = `Bravo Candidate${runId + 1}`

    await page.getByTestId('candidate-pipeline-card').filter({ hasText: alphaName }).click()
    await expect(page.getByRole('heading', { name: alphaName })).toBeVisible()
    await expect(page.getByText(candidateA.email, { exact: true })).toBeVisible()

    let delayedRequestObserved = false
    await page.route(`**/api/applications/${applicationB.id}`, async (route) => {
      delayedRequestObserved = true
      await new Promise(resolve => setTimeout(resolve, 2500))
      await route.continue()
    })

    await page.getByTestId('candidate-pipeline-card').filter({ hasText: bravoName }).click({ force: true })

    await expect.poll(() => delayedRequestObserved).toBe(true)

    // While Candidate B is deliberately still loading, Candidate A must already be gone
    // and Candidate B must not be rendered from stale/cached record state.
    await expect(page.getByRole('heading', { name: alphaName })).toHaveCount(0)
    await expect(page.getByText(candidateA.email, { exact: true })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: bravoName })).toHaveCount(0)
    await expect(page.getByText(candidateB.email, { exact: true })).toHaveCount(0)

    await expect(page.getByRole('heading', { name: bravoName })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(candidateB.email, { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: alphaName })).toHaveCount(0)

    const applicationBResponse = await page.request.get(`/api/applications/${applicationB.id}`)
    expect(applicationBResponse.ok()).toBeTruthy()
    const applicationBBody = await applicationBResponse.json()
    expect(applicationBBody.candidateId).toBe(candidateB.id)

    const applicationAResponse = await page.request.get(`/api/applications/${applicationA.id}`)
    expect(applicationAResponse.ok()).toBeTruthy()
    const applicationABody = await applicationAResponse.json()
    expect(applicationABody.candidateId).toBe(candidateA.id)
  })
})
