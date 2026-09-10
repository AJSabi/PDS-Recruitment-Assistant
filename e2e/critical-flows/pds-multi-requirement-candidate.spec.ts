import { test, expect } from '../fixtures'

async function createRequirement(page: any, title: string) {
  const response = await page.request.post('/api/jobs', {
    data: {
      title,
      description: 'E2E requirement for validating one candidate across multiple requirements.',
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

test.describe('PDS Multi-Requirement Candidate Governance', () => {
  test('the same candidate can have independent applications for different requirements', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    const runId = Date.now()

    const [firstRequirement, secondRequirement] = await Promise.all([
      createRequirement(page, `PDS Multi Requirement A ${runId}`),
      createRequirement(page, `PDS Multi Requirement B ${runId}`),
    ])

    const candidateResponse = await page.request.post('/api/candidates', {
      data: {
        firstName: 'Multi',
        lastName: `Requirement${runId}`,
        email: `multi-requirement-${runId}@test.local`,
      },
    })
    expect(candidateResponse.status()).toBe(201)
    const candidate = await candidateResponse.json()

    const firstApplicationResponse = await page.request.post('/api/applications', {
      data: { candidateId: candidate.id, jobId: firstRequirement.id },
    })
    expect(firstApplicationResponse.status()).toBe(201)
    const firstApplication = await firstApplicationResponse.json()

    const secondApplicationResponse = await page.request.post('/api/applications', {
      data: { candidateId: candidate.id, jobId: secondRequirement.id },
    })
    expect(secondApplicationResponse.status()).toBe(201)
    const secondApplication = await secondApplicationResponse.json()

    expect(secondApplication.id).not.toBe(firstApplication.id)
    expect(firstApplication.candidateId).toBe(candidate.id)
    expect(secondApplication.candidateId).toBe(candidate.id)
    expect(firstApplication.jobId).toBe(firstRequirement.id)
    expect(secondApplication.jobId).toBe(secondRequirement.id)

    const [firstProfileResponse, secondProfileResponse] = await Promise.all([
      page.request.get(`/api/applications/${firstApplication.id}/recruitment-profile`),
      page.request.get(`/api/applications/${secondApplication.id}/recruitment-profile`),
    ])
    expect(firstProfileResponse.ok()).toBeTruthy()
    expect(secondProfileResponse.ok()).toBeTruthy()

    const duplicateSameRequirementResponse = await page.request.post('/api/applications', {
      data: { candidateId: candidate.id, jobId: firstRequirement.id },
    })
    expect(duplicateSameRequirementResponse.status()).toBe(409)
  })
})
