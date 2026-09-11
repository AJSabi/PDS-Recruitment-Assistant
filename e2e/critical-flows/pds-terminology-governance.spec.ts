import { test, expect } from '../fixtures'

async function createRequirement(page: any, title: string) {
  const response = await page.request.post('/api/jobs', {
    data: {
      title,
      description: 'E2E requirement used to verify PDS terminology governance.',
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
      firstName: 'Terminology',
      lastName: `Candidate${runId}`,
      email: `terminology-${runId}@test.local`,
      phone: `6${String(runId).slice(-9).padStart(9, '0')}`,
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

test.describe('PDS Terminology Governance', () => {
  test('active recruiter UI uses governed recruitment stages and does not expose the legacy generic ATS status control', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    const runId = Date.now()
    const requirement = await createRequirement(page, `PDS Terminology ${runId}`)
    const candidate = await createCandidate(page, runId)
    await linkCandidate(page, requirement.id, candidate.id)

    await page.goto(`/dashboard/jobs/${requirement.id}/candidates`)
    await expect(page.getByTestId('candidate-pipeline-board')).toBeVisible()

    // The active pipeline is expressed in the PDS recruitment-stage language.
    for (const stage of ['New / Intake', 'Recruiter Screening', 'Interview', 'Offer', 'Joined', 'Closed']) {
      await expect(page.getByRole('heading', { name: stage, exact: true })).toBeVisible()
    }

    const candidateName = `Terminology Candidate${runId}`
    await page.getByTestId('candidate-pipeline-card').filter({ hasText: candidateName }).click()

    const workspace = page.getByTestId('pds-recruiter-candidate-workspace')
    await expect(workspace).toBeVisible()

    const recruitmentState = page.getByTestId('pds-workspace-recruitment-state')
    await expect(recruitmentState.getByText('Current Stage', { exact: true })).toBeVisible()
    await expect(recruitmentState.getByText('Candidate Added', { exact: true })).toBeVisible()
    await expect(recruitmentState.getByText('Current Fit', { exact: true })).toBeVisible()
    await expect(workspace.getByRole('heading', { name: 'Stage Progression', exact: true })).toBeVisible()

    // Candidate fit and recruitment stage remain visibly distinct concepts.
    await expect(recruitmentState.getByText('Current Stage', { exact: true })).toHaveCount(1)
    await expect(recruitmentState.getByText('Current Fit', { exact: true })).toHaveCount(1)

    // The retired generic ATS application-status control used these transition labels.
    // None may reappear as active transition buttons inside the PDS recruiter workspace.
    for (const legacyAction of ['Re-open', 'Screening', 'Interview', 'Offer', 'Hired', 'Reject']) {
      await expect(workspace.getByRole('button', { name: legacyAction, exact: true })).toHaveCount(0)
    }
    await expect(workspace.getByText('Application Status', { exact: true })).toHaveCount(0)
  })
})
