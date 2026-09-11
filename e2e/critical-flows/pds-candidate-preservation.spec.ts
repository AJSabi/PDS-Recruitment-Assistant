import { test, expect } from '../fixtures'

function pdfBuffer(lines: string[]) {
  const escapePdf = (value: string) => value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
  const text = lines.map((line, index) => `${index ? '0 -18 Td\n' : ''}(${escapePdf(line)}) Tj`).join('\n')
  const stream = `BT\n/F1 12 Tf\n72 720 Td\n${text}\nET\n`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
  ]

  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  for (let index = 0; index < objects.length; index++) {
    offsets.push(Buffer.byteLength(pdf))
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`
  }
  const xrefOffset = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let index = 1; index <= objects.length; index++) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(pdf)
}

test.describe('PDS Candidate and Resume Preservation', () => {
  test('reuses one candidate across requirements while preserving identity, resumes, and earlier history', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    const runId = Date.now()
    const originalEmail = `preservation-${runId}@test.local`

    const createJob = async (suffix: string) => {
      const response = await page.request.post('/api/jobs', {
        data: {
          title: `PDS Preservation ${suffix} ${runId}`,
          description: 'E2E requirement used to verify candidate identity and resume history preservation.',
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

    const candidateResponse = await page.request.post('/api/candidates', {
      data: {
        firstName: 'Original',
        lastName: 'Candidate',
        email: originalEmail,
        phone: '+919999990001',
      },
    })
    expect(candidateResponse.status()).toBe(201)
    const candidate = await candidateResponse.json()

    const duplicateResponse = await page.request.post('/api/candidates', {
      data: {
        firstName: 'Replacement',
        lastName: 'Identity',
        email: originalEmail.toUpperCase(),
      },
    })
    expect(duplicateResponse.status()).toBe(409)

    const jobA = await createJob('A')
    const applicationAResponse = await page.request.post('/api/applications', {
      data: { candidateId: candidate.id, jobId: jobA.id },
    })
    expect(applicationAResponse.status()).toBe(201)
    const applicationA = await applicationAResponse.json()
    expect(applicationA.candidateId).toBe(candidate.id)

    const notProceedingResponse = await page.request.post(`/api/applications/${applicationA.id}/stage/confirm`, {
      data: { stage: 'not_proceeding', note: 'Preservation test historical decision.' },
    })
    expect(notProceedingResponse.ok()).toBeTruthy()
    const reassessResponse = await page.request.post(`/api/applications/${applicationA.id}/stage/confirm`, {
      data: { stage: 'reassess' },
    })
    expect(reassessResponse.ok()).toBeTruthy()

    const historyBeforeResponse = await page.request.get(`/api/applications/${applicationA.id}/history`)
    expect(historyBeforeResponse.ok()).toBeTruthy()
    const historyBefore = await historyBeforeResponse.json()
    expect(historyBefore.profile.lastStatus).toBe('reassess')
    const evidenceIdsBefore = historyBefore.evidence.map((item: any) => item.id)
    expect(evidenceIdsBefore.length).toBeGreaterThanOrEqual(3)

    const firstResumeResponse = await page.request.post(`/api/candidates/${candidate.id}/documents`, {
      multipart: {
        type: 'resume',
        file: {
          name: 'original-resume.pdf',
          mimeType: 'application/pdf',
          buffer: pdfBuffer([
            'Original Candidate',
            originalEmail,
            '+91 9999990001',
            'Experience: 5 years in infrastructure sales',
          ]),
        },
      },
    })
    expect(firstResumeResponse.status()).toBe(201)
    const firstResume = await firstResumeResponse.json()

    const jobB = await createJob('B')
    const applicationBResponse = await page.request.post('/api/applications', {
      data: { candidateId: candidate.id, jobId: jobB.id },
    })
    expect(applicationBResponse.status()).toBe(201)
    const applicationB = await applicationBResponse.json()
    expect(applicationB.candidateId).toBe(candidate.id)
    expect(applicationB.id).not.toBe(applicationA.id)

    const duplicateApplicationResponse = await page.request.post('/api/applications', {
      data: { candidateId: candidate.id, jobId: jobB.id },
    })
    expect(duplicateApplicationResponse.status()).toBe(409)

    const changedResumeEmail = `different-person-${runId}@example.com`
    const secondResumeResponse = await page.request.post(`/api/candidates/${candidate.id}/documents`, {
      multipart: {
        type: 'resume',
        file: {
          name: 'newer-resume-with-changed-identity.pdf',
          mimeType: 'application/pdf',
          buffer: pdfBuffer([
            'Different Resume Name',
            changedResumeEmail,
            '+91 8888880002',
            'Experience: 7 years in enterprise technology sales',
          ]),
        },
      },
    })
    expect(secondResumeResponse.status()).toBe(201)
    const secondResume = await secondResumeResponse.json()
    expect(secondResume.id).not.toBe(firstResume.id)

    const candidateDetailResponse = await page.request.get(`/api/candidates/${candidate.id}`)
    expect(candidateDetailResponse.ok()).toBeTruthy()
    const candidateDetail = await candidateDetailResponse.json()

    expect(candidateDetail.id).toBe(candidate.id)
    expect(candidateDetail.firstName).toBe('Original')
    expect(candidateDetail.lastName).toBe('Candidate')
    expect(candidateDetail.email).toBe(originalEmail)
    expect(candidateDetail.phone).toBe('+919999990001')

    const applicationIds = candidateDetail.applications.map((item: any) => item.id)
    expect(applicationIds).toContain(applicationA.id)
    expect(applicationIds).toContain(applicationB.id)

    const documentIds = candidateDetail.documents.map((item: any) => item.id)
    expect(documentIds).toContain(firstResume.id)
    expect(documentIds).toContain(secondResume.id)
    expect(candidateDetail.documents.filter((item: any) => item.type === 'resume')).toHaveLength(2)
    expect(candidateDetail.documents.find((item: any) => item.id === firstResume.id)?.originalFilename).toBe('original-resume.pdf')
    expect(candidateDetail.documents.find((item: any) => item.id === secondResume.id)?.originalFilename).toBe('newer-resume-with-changed-identity.pdf')

    const historyAfterResponse = await page.request.get(`/api/applications/${applicationA.id}/history`)
    expect(historyAfterResponse.ok()).toBeTruthy()
    const historyAfter = await historyAfterResponse.json()
    expect(historyAfter.application.candidateId).toBe(candidate.id)
    expect(historyAfter.profile.lastStatus).toBe('reassess')
    const evidenceIdsAfter = new Set(historyAfter.evidence.map((item: any) => item.id))
    for (const evidenceId of evidenceIdsBefore) expect(evidenceIdsAfter.has(evidenceId)).toBe(true)

    const applicationBHistoryResponse = await page.request.get(`/api/applications/${applicationB.id}/history`)
    expect(applicationBHistoryResponse.ok()).toBeTruthy()
    const applicationBHistory = await applicationBHistoryResponse.json()
    expect(applicationBHistory.application.candidateId).toBe(candidate.id)
    expect(applicationBHistory.profile.applicationId).toBe(applicationB.id)
  })
})
