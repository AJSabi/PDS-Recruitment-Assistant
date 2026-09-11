import { execFileSync } from 'node:child_process'
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

async function waitForMinio() {
  let lastError: unknown
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch('http://127.0.0.1:9000/minio/health/live')
      if (response.ok) return
    } catch (error) {
      lastError = error
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw lastError instanceof Error ? lastError : new Error('MinIO did not become healthy after restart')
}

test.describe('PDS Public Application Atomicity', () => {
  test('valid public application persists candidate, application, resume and source attribution', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    const runId = Date.now()
    const email = `public-success-${runId}@test.local`

    const jobResponse = await page.request.post('/api/jobs', {
      data: {
        title: `PDS Public Atomicity ${runId}`,
        description: 'E2E requirement used to verify public application persistence and storage atomicity.',
        location: 'Noida',
        type: 'full_time',
        status: 'open',
        requireResume: true,
        autoScoreOnApply: false,
        questions: [],
        criteria: [],
      },
    })
    expect(jobResponse.status()).toBe(201)
    const job = await jobResponse.json()

    const applyResponse = await page.request.post(`/api/public/jobs/${job.slug}/apply`, {
      multipart: {
        firstName: 'Public',
        lastName: 'Success',
        email,
        responses: '[]',
        utmSource: 'linkedin',
        resume: {
          name: 'public-success-resume.pdf',
          mimeType: 'application/pdf',
          buffer: pdfBuffer([
            'Public Success',
            email,
            '+91 9999990011',
            'Experience: enterprise infrastructure sales',
          ]),
        },
      },
    })
    expect(applyResponse.status()).toBe(201)
    expect(await applyResponse.json()).toEqual({ success: true })

    const candidatesResponse = await page.request.get(`/api/candidates?search=${encodeURIComponent(email)}&page=1&limit=20`)
    expect(candidatesResponse.ok()).toBeTruthy()
    const candidates = await candidatesResponse.json()
    expect(candidates.total).toBe(1)
    expect(candidates.data).toHaveLength(1)
    const candidate = candidates.data[0]
    expect(candidate.email).toBe(email)
    expect(candidate.applicationCount).toBe(1)

    const candidateDetailResponse = await page.request.get(`/api/candidates/${candidate.id}`)
    expect(candidateDetailResponse.ok()).toBeTruthy()
    const candidateDetail = await candidateDetailResponse.json()
    const resume = candidateDetail.documents.find((item: any) => item.originalFilename === 'public-success-resume.pdf')
    expect(resume).toBeTruthy()
    expect(resume.type).toBe('resume')

    const applicationsResponse = await page.request.get(`/api/applications?jobId=${job.id}&candidateId=${candidate.id}&page=1&limit=20`)
    expect(applicationsResponse.ok()).toBeTruthy()
    const applications = await applicationsResponse.json()
    expect(applications.total).toBe(1)
    expect(applications.data).toHaveLength(1)
    expect(applications.data[0].candidateEmail).toBe(email)

    const sourceResponse = await page.request.get(`/api/source-tracking/stats?jobId=${job.id}`)
    expect(sourceResponse.ok()).toBeTruthy()
    const sourceStats = await sourceResponse.json()
    const attribution = sourceStats.recentAttributed.find((item: any) => item.candidateEmail === email)
    expect(attribution).toBeTruthy()
    expect(attribution.applicationId).toBe(applications.data[0].id)
    expect(attribution.channel).toBe('linkedin')
    expect(attribution.utmSource).toBe('linkedin')
  })

  test('resume storage outage leaves no partial candidate, application, source or document state', async ({ authenticatedPage }) => {
    test.skip(!process.env.CI, 'This outage regression uses the dedicated CI MinIO container.')

    const page = authenticatedPage
    const runId = Date.now()
    const email = `public-storage-failure-${runId}@test.local`

    const jobResponse = await page.request.post('/api/jobs', {
      data: {
        title: `PDS Public Storage Failure ${runId}`,
        description: 'E2E requirement used to verify failed resume storage cannot leave partial public application state.',
        location: 'Noida',
        type: 'full_time',
        status: 'open',
        requireResume: true,
        autoScoreOnApply: false,
        questions: [],
        criteria: [],
      },
    })
    expect(jobResponse.status()).toBe(201)
    const job = await jobResponse.json()

    execFileSync('docker', ['stop', 'pds-minio'], { stdio: 'pipe' })
    try {
      const failedApplyResponse = await page.request.post(`/api/public/jobs/${job.slug}/apply`, {
        multipart: {
          firstName: 'Storage',
          lastName: 'Failure',
          email,
          responses: '[]',
          utmSource: 'linkedin',
          resume: {
            name: 'storage-failure-resume.pdf',
            mimeType: 'application/pdf',
            buffer: pdfBuffer([
              'Storage Failure',
              email,
              '+91 9999990012',
              'Experience: infrastructure sales',
            ]),
          },
        },
        timeout: 60_000,
      })
      expect(failedApplyResponse.status()).toBe(502)
    } finally {
      execFileSync('docker', ['start', 'pds-minio'], { stdio: 'pipe' })
      await waitForMinio()
    }

    const candidatesResponse = await page.request.get(`/api/candidates?search=${encodeURIComponent(email)}&page=1&limit=20`)
    expect(candidatesResponse.ok()).toBeTruthy()
    const candidates = await candidatesResponse.json()
    expect(candidates.total).toBe(0)
    expect(candidates.data).toHaveLength(0)

    const applicationsResponse = await page.request.get(`/api/applications?jobId=${job.id}&page=1&limit=20`)
    expect(applicationsResponse.ok()).toBeTruthy()
    const applications = await applicationsResponse.json()
    expect(applications.data.some((item: any) => item.candidateEmail === email)).toBe(false)

    const sourceResponse = await page.request.get(`/api/source-tracking/stats?jobId=${job.id}`)
    expect(sourceResponse.ok()).toBeTruthy()
    const sourceStats = await sourceResponse.json()
    expect(sourceStats.recentAttributed.some((item: any) => item.candidateEmail === email)).toBe(false)
    expect(sourceStats.channelBreakdown.reduce((sum: number, item: any) => sum + Number(item.count), 0)).toBe(0)
  })
})
