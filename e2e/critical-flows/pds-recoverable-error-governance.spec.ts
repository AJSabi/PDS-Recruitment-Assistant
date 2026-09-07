import { test, expect } from '../fixtures'

async function createRequirement(page: any, title: string) {
  const response = await page.request.post('/api/jobs', {
    data: {
      title,
      description: 'E2E requirement used to verify recoverable validation and API errors.',
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

async function createCandidate(page: any, runId: number) {
  const response = await page.request.post('/api/candidates', {
    data: {
      firstName: 'Recoverable',
      lastName: `Error${runId}`,
      email: `recoverable-error-${runId}@test.local`,
      phone: `7${String(runId).slice(-9).padStart(9, '0')}`,
    },
  })
  expect(response.status()).toBe(201)
  return response.json()
}

test.describe('PDS Recoverable Error Governance', () => {
  test('validation and API errors stay human-readable and the recruiter can recover without leaving the page', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    const runId = Date.now()
    const requirement = await createRequirement(page, `PDS Recoverable Error ${runId}`)

    await page.goto(`/dashboard/jobs/${requirement.id}/settings`)
    await expect(page.getByRole('heading', { name: 'Job Settings' })).toBeVisible()

    const titleInput = page.getByLabel('Title')
    await titleInput.fill('')
    await page.getByRole('button', { name: 'Save Changes' }).click()

    await expect(page.getByText('Title is required')).toBeVisible()
    await expect(page.locator('body')).not.toContainText('TypeError:')
    await expect(page.locator('body')).not.toContainText('at Object.')
    await expect(page.locator('body')).not.toContainText('node_modules/')

    const recoveredTitle = `PDS Recovered ${runId}`
    await titleInput.fill(recoveredTitle)
    const saveResponsePromise = page.waitForResponse(
      response => response.url().includes(`/api/jobs/${requirement.id}`) && response.request().method() === 'PATCH',
    )
    await page.getByRole('button', { name: 'Save Changes' }).click()
    const saveResponse = await saveResponsePromise
    expect(saveResponse.ok()).toBeTruthy()
    await expect(page.getByRole('button', { name: 'Saved!' })).toBeVisible()

    const candidate = await createCandidate(page, runId)
    const applicationResponse = await page.request.post('/api/applications', {
      data: { jobId: requirement.id, candidateId: candidate.id },
    })
    expect(applicationResponse.status()).toBe(201)

    await page.reload()
    await expect(page.getByLabel('Title')).toHaveValue(recoveredTitle)

    await page.getByRole('button', { name: 'Delete this Job' }).click()
    await expect(page.getByText('Are you sure you want to delete', { exact: false })).toBeVisible()

    const deleteResponsePromise = page.waitForResponse(
      response => response.url().includes(`/api/jobs/${requirement.id}`) && response.request().method() === 'DELETE',
    )
    await page.getByRole('button', { name: 'Yes, Delete' }).click()
    const deleteResponse = await deleteResponsePromise
    expect(deleteResponse.status()).toBe(409)

    await expect(page.getByText('Failed to delete job')).toBeVisible()
    await expect(page.getByText(/recruitment history/i)).toBeVisible()
    await expect(page.locator('body')).not.toContainText('TypeError:')
    await expect(page.locator('body')).not.toContainText('at Object.')
    await expect(page.locator('body')).not.toContainText('node_modules/')

    // The failed mutation must be recoverable: the confirmation closes and the
    // recruiter remains on the settings page with the persisted requirement.
    await expect(page.getByRole('button', { name: 'Delete this Job' })).toBeVisible()
    await expect(page.getByLabel('Title')).toHaveValue(recoveredTitle)

    const survivingRequirement = await page.request.get(`/api/jobs/${requirement.id}`)
    expect(survivingRequirement.ok()).toBeTruthy()
    const survivingRequirementBody = await survivingRequirement.json()
    expect(survivingRequirementBody.title).toBe(recoveredTitle)
  })
})
