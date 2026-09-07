import { test, expect } from '../fixtures'

test.describe('PDS Candidate Identity Conflict Resolution', () => {
  test('requires explicit review, rejects conflicting refresh atomically, and selectively refreshes the reused candidate', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    const runId = Date.now()
    const originalEmail = `identity-master-${runId}@test.local`
    const collisionEmail = `identity-collision-${runId}@test.local`
    const originalPhone = '+919888880001'
    const reviewedPhone = '+919888880099'

    const jobResponse = await page.request.post('/api/jobs', {
      data: {
        title: `PDS Identity Review ${runId}`,
        description: 'E2E requirement for explicit duplicate identity review and atomic candidate reuse.',
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
        firstName: 'Master',
        lastName: 'Candidate',
        email: originalEmail,
        phone: originalPhone,
      },
    })
    expect(candidateResponse.status()).toBe(201)
    const candidate = await candidateResponse.json()

    const collisionCandidateResponse = await page.request.post('/api/candidates', {
      data: {
        firstName: 'Collision',
        lastName: 'Candidate',
        email: collisionEmail,
        phone: '+919777770002',
      },
    })
    expect(collisionCandidateResponse.status()).toBe(201)

    const identityCheckResponse = await page.request.post(`/api/jobs/${job.id}/candidate-identity-check`, {
      data: {
        firstName: 'Reviewed',
        lastName: 'Candidate',
        email: originalEmail,
        phone: reviewedPhone,
      },
    })
    expect(identityCheckResponse.ok()).toBeTruthy()
    const identityCheck = await identityCheckResponse.json()
    expect(identityCheck.matched).toBe(true)
    expect(identityCheck.candidate.id).toBe(candidate.id)
    expect(identityCheck.matchBasis).toBe('email')
    expect(identityCheck.requiresConfirmation).toBe(true)
    expect(identityCheck.conflicts.map((conflict: any) => conflict.field)).toEqual(expect.arrayContaining(['name', 'phone']))

    const implicitReuseResponse = await page.request.post(`/api/jobs/${job.id}/candidate-intake`, {
      data: {
        firstName: 'Reviewed',
        lastName: 'Candidate',
        email: originalEmail,
        phone: reviewedPhone,
        source: 'recruiter_sourcing',
      },
    })
    expect(implicitReuseResponse.status()).toBe(409)

    const conflictingRefreshResponse = await page.request.post(`/api/jobs/${job.id}/candidate-intake`, {
      data: {
        candidateId: candidate.id,
        source: 'recruiter_sourcing',
        identityConflictResolution: {
          confirmed: true,
          refreshedFields: ['email'],
          reviewedIdentity: {
            firstName: 'Reviewed',
            lastName: 'Candidate',
            email: collisionEmail,
            phone: originalPhone,
          },
        },
      },
    })
    expect(conflictingRefreshResponse.status()).toBe(409)

    const afterRejectedResolutionResponse = await page.request.get(`/api/candidates/${candidate.id}`)
    expect(afterRejectedResolutionResponse.ok()).toBeTruthy()
    const afterRejectedResolution = await afterRejectedResolutionResponse.json()
    expect(afterRejectedResolution.firstName).toBe('Master')
    expect(afterRejectedResolution.lastName).toBe('Candidate')
    expect(afterRejectedResolution.email).toBe(originalEmail)
    expect(afterRejectedResolution.phone).toBe(originalPhone)
    expect(afterRejectedResolution.applications.some((application: any) => application.job.id === job.id)).toBe(false)

    const confirmedResolutionResponse = await page.request.post(`/api/jobs/${job.id}/candidate-intake`, {
      data: {
        candidateId: candidate.id,
        source: 'recruiter_sourcing',
        identityConflictResolution: {
          confirmed: true,
          refreshedFields: ['name'],
          reviewedIdentity: {
            firstName: 'Reviewed',
            lastName: 'Candidate',
            email: originalEmail,
            phone: reviewedPhone,
          },
        },
      },
    })
    expect(confirmedResolutionResponse.status()).toBe(201)
    const confirmedResolution = await confirmedResolutionResponse.json()
    expect(confirmedResolution.created).toBe(true)
    expect(confirmedResolution.candidate.id).toBe(candidate.id)

    const afterConfirmedResolutionResponse = await page.request.get(`/api/candidates/${candidate.id}`)
    expect(afterConfirmedResolutionResponse.ok()).toBeTruthy()
    const afterConfirmedResolution = await afterConfirmedResolutionResponse.json()
    expect(afterConfirmedResolution.firstName).toBe('Reviewed')
    expect(afterConfirmedResolution.lastName).toBe('Candidate')
    expect(afterConfirmedResolution.email).toBe(originalEmail)
    expect(afterConfirmedResolution.phone).toBe(originalPhone)

    const linkedApplications = afterConfirmedResolution.applications.filter((application: any) => application.job.id === job.id)
    expect(linkedApplications).toHaveLength(1)
    expect(linkedApplications[0].id).toBe(confirmedResolution.applicationId)

    const repeatResolutionResponse = await page.request.post(`/api/jobs/${job.id}/candidate-intake`, {
      data: {
        candidateId: candidate.id,
        source: 'recruiter_sourcing',
        identityConflictResolution: {
          confirmed: true,
          refreshedFields: ['phone'],
          reviewedIdentity: {
            firstName: 'Reviewed',
            lastName: 'Candidate',
            email: originalEmail,
            phone: reviewedPhone,
          },
        },
      },
    })
    expect(repeatResolutionResponse.ok()).toBeTruthy()
    const repeatResolution = await repeatResolutionResponse.json()
    expect(repeatResolution.created).toBe(false)
    expect(repeatResolution.applicationId).toBe(confirmedResolution.applicationId)

    const finalCandidateResponse = await page.request.get(`/api/candidates/${candidate.id}`)
    expect(finalCandidateResponse.ok()).toBeTruthy()
    const finalCandidate = await finalCandidateResponse.json()
    expect(finalCandidate.id).toBe(candidate.id)
    expect(finalCandidate.email).toBe(originalEmail)
    expect(finalCandidate.phone).toBe(reviewedPhone)
    expect(finalCandidate.applications.filter((application: any) => application.job.id === job.id)).toHaveLength(1)
  })
})
