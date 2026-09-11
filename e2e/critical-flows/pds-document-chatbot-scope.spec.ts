import { test, expect, declineAnalyticsConsent } from '../fixtures'

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

async function createRequirement(page: any, title: string) {
  const response = await page.request.post('/api/jobs', {
    data: {
      title,
      description: 'E2E requirement used to verify document and chatbot authorization.',
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

test.describe('PDS Document Authorization and Chatbot Scope', () => {
  test('document download requires authentication and returns private attachment bytes to an authorized user', async ({ authenticatedPage, browser }) => {
    const page = authenticatedPage
    const runId = Date.now()
    const candidateResponse = await page.request.post('/api/candidates', {
      data: {
        firstName: 'Document',
        lastName: `Candidate${runId}`,
        email: `document-auth-${runId}@test.local`,
      },
    })
    expect(candidateResponse.status()).toBe(201)
    const candidate = await candidateResponse.json()

    const uploadResponse = await page.request.post(`/api/candidates/${candidate.id}/documents`, {
      multipart: {
        type: 'resume',
        file: {
          name: 'authorization-resume.pdf',
          mimeType: 'application/pdf',
          buffer: pdfBuffer(['Document Candidate', `document-auth-${runId}@test.local`, 'Private recruitment document']),
        },
      },
    })
    expect(uploadResponse.status()).toBe(201)
    const document = await uploadResponse.json()

    const authorized = await page.request.get(`/api/documents/${document.id}/download`)
    expect(authorized.status()).toBe(200)
    expect(authorized.headers()['content-disposition']).toContain('attachment')
    expect(authorized.headers()['cache-control']).toContain('no-store')
    expect((await authorized.body()).subarray(0, 4).toString()).toBe('%PDF')

    const anonymousContext = await browser.newContext()
    try {
      const anonymousResponse = await anonymousContext.request.get(`/api/documents/${document.id}/download`)
      expect([401, 403]).toContain(anonymousResponse.status())
    }
    finally {
      await anonymousContext.close()
    }
  })

  test('member chatbot conversations cannot escape allocated requirement scope', async ({ authenticatedPage, browser }) => {
    const ownerPage = authenticatedPage
    const runId = Date.now()
    const allocatedJob = await createRequirement(ownerPage, `PDS Chat Allocated ${runId}`)
    const hiddenJob = await createRequirement(ownerPage, `PDS Chat Hidden ${runId}`)
    const recruiter = {
      name: `Chat Recruiter ${runId}`,
      email: `chat-recruiter-${runId}@test.local`,
      password: process.env.E2E_TEST_PASSWORD || 'TestPassword123!',
    }

    const inviteResponse = await ownerPage.request.post('/api/invite-links', {
      data: { role: 'member', maxUses: 1, expiresInHours: 1 },
    })
    expect(inviteResponse.status()).toBe(201)
    const invite = await inviteResponse.json()

    const recruiterContext = await browser.newContext()
    await declineAnalyticsConsent(recruiterContext)
    const recruiterPage = await recruiterContext.newPage()

    try {
      await recruiterPage.goto('/auth/sign-up')
      await recruiterPage.waitForLoadState('networkidle')
      await recruiterPage.getByLabel('Name').fill(recruiter.name)
      await recruiterPage.getByLabel('Email').fill(recruiter.email)
      await recruiterPage.getByLabel('Password', { exact: true }).fill(recruiter.password)
      await recruiterPage.getByLabel('Confirm password').fill(recruiter.password)
      await Promise.all([
        recruiterPage.waitForResponse(response => response.url().includes('/api/auth/sign-up') && response.status() === 200),
        recruiterPage.getByRole('button', { name: 'Sign up' }).click(),
      ])

      await recruiterPage.goto(`/join/${invite.token}`)
      await recruiterPage.waitForLoadState('networkidle')
      await Promise.all([
        recruiterPage.waitForResponse(response => response.url().includes('/api/invite-links/accept') && response.status() === 200),
        recruiterPage.getByRole('button', { name: /Join / }).click(),
      ])
      await recruiterPage.waitForURL(url => url.pathname.includes('/dashboard'), { timeout: 10_000 })

      const allocationResponse = await ownerPage.request.get('/api/requirement-allocations')
      expect(allocationResponse.ok()).toBeTruthy()
      const allocationData = await allocationResponse.json()
      const member = allocationData.members.find((person: any) => person.email === recruiter.email)
      expect(member?.userId).toBeTruthy()

      const assignResponse = await ownerPage.request.put(`/api/requirement-allocations/${allocatedJob.id}`, {
        data: { ownerUserId: member.userId },
      })
      expect(assignResponse.ok()).toBeTruthy()

      const orgScopeResponse = await recruiterPage.request.post('/api/chatbot/conversations', {
        data: { scope: { kind: 'organization' } },
      })
      expect(orgScopeResponse.status()).toBe(403)

      const hiddenScopeResponse = await recruiterPage.request.post('/api/chatbot/conversations', {
        data: { scope: { kind: 'job', jobId: hiddenJob.id } },
      })
      expect(hiddenScopeResponse.status()).toBe(404)

      const allocatedScopeResponse = await recruiterPage.request.post('/api/chatbot/conversations', {
        data: { scope: { kind: 'job', jobId: allocatedJob.id } },
      })
      expect(allocatedScopeResponse.status()).toBe(200)
      const allocatedConversation = (await allocatedScopeResponse.json()).conversation
      expect(allocatedConversation.scope).toEqual({ kind: 'job', jobId: allocatedJob.id })

      const patchHiddenResponse = await recruiterPage.request.patch(`/api/chatbot/conversations/${allocatedConversation.id}`, {
        data: { scope: { kind: 'job', jobId: hiddenJob.id } },
      })
      expect(patchHiddenResponse.status()).toBe(404)

      const patchOrgResponse = await recruiterPage.request.patch(`/api/chatbot/conversations/${allocatedConversation.id}`, {
        data: { scope: { kind: 'organization' } },
      })
      expect(patchOrgResponse.status()).toBe(403)

      const chatHiddenResponse = await recruiterPage.request.post('/api/chatbot/chat', {
        data: {
          conversationId: allocatedConversation.id,
          scope: { kind: 'job', jobId: hiddenJob.id },
          messages: [{ role: 'user', content: 'Show candidates.' }],
        },
      })
      expect(chatHiddenResponse.status()).toBe(404)

      const conversationResponse = await recruiterPage.request.get(`/api/chatbot/conversations/${allocatedConversation.id}`)
      expect(conversationResponse.ok()).toBeTruthy()
      const conversation = (await conversationResponse.json()).conversation
      expect(conversation.scope).toEqual({ kind: 'job', jobId: allocatedJob.id })
    }
    finally {
      await recruiterContext.close()
    }
  })
})
