import { test, expect } from '../fixtures'

async function createRequirement(page: any, title: string) {
  const response = await page.request.post('/api/jobs', {
    data: {
      title,
      description: 'E2E requirement used to verify PDS Requirement Settings governance.',
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
      firstName: 'SettingsHistory',
      lastName: `Candidate${runId}`,
      email: `settings-history-${runId}@test.local`,
      phone: `8${String(runId).slice(-9).padStart(9, '0')}`,
    },
  })
  expect(response.status()).toBe(201)
  return response.json()
}

test.describe('PDS Requirement Settings Governance', () => {
  test('allowed settings persist while recruitment history cannot be hard-deleted', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    const runId = Date.now()
    const requirement = await createRequirement(page, `PDS Settings ${runId}`)
    const updatedTitle = `PDS Settings Updated ${runId}`
    const updatedLocation = `Noida Sector 144 ${runId}`

    await page.goto(`/dashboard/jobs/${requirement.id}/settings`)
    await expect(page.getByRole('heading', { name: 'Job Settings' })).toBeVisible()

    const titleInput = page.getByLabel('Title')
    const locationInput = page.getByLabel('Location')
    const requireResume = page.getByLabel('Require resume/CV')

    await expect(titleInput).toHaveValue(requirement.title)
    await titleInput.fill(updatedTitle)
    await locationInput.fill(updatedLocation)
    if (!(await requireResume.isChecked())) await requireResume.check()

    const saveResponsePromise = page.waitForResponse(
      response => response.url().includes(`/api/jobs/${requirement.id}`) && response.request().method() === 'PATCH',
    )
    await page.getByRole('button', { name: 'Save Changes' }).click()
    const saveResponse = await saveResponsePromise
    expect(saveResponse.ok()).toBeTruthy()
    await expect(page.getByRole('button', { name: 'Saved!' })).toBeVisible()

    await page.reload()
    await expect(page.getByLabel('Title')).toHaveValue(updatedTitle)
    await expect(page.getByLabel('Location')).toHaveValue(updatedLocation)
    await expect(page.getByLabel('Require resume/CV')).toBeChecked()

    const persistedResponse = await page.request.get(`/api/jobs/${requirement.id}`)
    expect(persistedResponse.ok()).toBeTruthy()
    const persisted = await persistedResponse.json()
    expect(persisted.title).toBe(updatedTitle)
    expect(persisted.location).toBe(updatedLocation)
    expect(persisted.requireResume).toBe(true)

    const candidate = await createCandidate(page, runId)
    const applicationResponse = await page.request.post('/api/applications', {
      data: { jobId: requirement.id, candidateId: candidate.id },
    })
    expect(applicationResponse.status()).toBe(201)
    const application = await applicationResponse.json()

    const deleteResponse = await page.request.delete(`/api/jobs/${requirement.id}`)
    expect(deleteResponse.status()).toBe(409)
    const deleteBody = await deleteResponse.json()
    expect(deleteBody.statusMessage).toContain('recruitment history')

    const survivingRequirement = await page.request.get(`/api/jobs/${requirement.id}`)
    expect(survivingRequirement.ok()).toBeTruthy()

    const survivingApplication = await page.request.get(`/api/applications/${application.id}`)
    expect(survivingApplication.ok()).toBeTruthy()
    const survivingApplicationBody = await survivingApplication.json()
    expect(survivingApplicationBody.id).toBe(application.id)
    expect(survivingApplicationBody.jobId).toBe(requirement.id)
    expect(survivingApplicationBody.candidateId).toBe(candidate.id)
  })
})
