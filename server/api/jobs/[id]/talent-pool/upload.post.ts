import { and, eq, ilike, isNull } from 'drizzle-orm'
import { fileTypeFromBuffer } from 'file-type'
import {
  candidate,
  document,
  job,
  jobSkillMatrix,
  recruitmentRequirementState,
  talentPoolMatch,
} from '../../../../database/schema'
import { extractCandidateIdentity } from '../../../../utils/ai/pdsCandidateIdentity'
import { loadAiConfig } from '../../../../utils/ai/loadConfig'
import { generatePdsResumeAssessment } from '../../../../utils/ai/pdsResumeAssessment'
import type { SupportedProvider } from '../../../../utils/ai/provider'
import { calculateProvisionalFit } from '../../../../utils/recruitmentScoring'
import { parseDocument, extractResumeText } from '../../../../utils/resume-parser'
import { inferResumeIdentity, isNameSupportedByResume } from '../../../../utils/resumeIdentity'
import { assertRequirementAccess } from '../../../../utils/recruitmentVisibility'
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  MAX_DOCUMENTS_PER_CANDIDATE,
  MIME_TO_EXTENSION,
  sanitizeFilename,
  isFilenameCompatibleWithMime,
} from '../../../../utils/schemas/document'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })
const FINAL_POOL_THRESHOLD = 50
const MAX_BULK_RESUMES = 20

function detectLegacyDoc(buffer: Buffer, mimeType?: string) {
  if (mimeType && mimeType !== 'application/x-cfb') return mimeType
  const magic = Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])
  return buffer.length >= 8 && Buffer.compare(buffer.subarray(0, 8), magic) === 0 ? 'application/msword' : mimeType
}

function phoneDigits(phone?: string | null) {
  const digits = (phone ?? '').replace(/\D/g, '')
  return digits.length >= 10 ? digits : null
}

function emailIsInResume(email: string | null, resumeText: string): boolean {
  return Boolean(email && resumeText.toLowerCase().includes(email.trim().toLowerCase()))
}

function phoneIsInResume(phone: string | null, resumeText: string): boolean {
  const digits = phoneDigits(phone)
  if (!digits) return false
  return resumeText.replace(/\D/g, '').includes(digits)
}

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, {
    candidate: ['create'],
    document: ['create'],
    application: ['read'],
    scoring: ['create'],
  })
  const orgId = session.session.activeOrganizationId
  const { id: jobId } = await getValidatedRouterParams(event, paramsSchema.parse)
  await assertRequirementAccess(orgId, session.user.id, jobId)

  const [jobRecord, matrixRecord, requirementState] = await Promise.all([
    db.query.job.findFirst({
      where: and(eq(job.id, jobId), eq(job.organizationId, orgId)),
      columns: { id: true, title: true, description: true },
    }),
    db.query.jobSkillMatrix.findFirst({
      where: and(eq(jobSkillMatrix.jobId, jobId), eq(jobSkillMatrix.organizationId, orgId)),
    }),
    db.query.recruitmentRequirementState.findFirst({
      where: and(eq(recruitmentRequirementState.jobId, jobId), eq(recruitmentRequirementState.organizationId, orgId)),
    }),
  ])

  if (!jobRecord) throw createError({ statusCode: 404, statusMessage: 'Requirement not found' })
  if (!jobRecord.description) throw createError({ statusCode: 422, statusMessage: 'Save the Active JD before adding resumes.' })
  if (!matrixRecord?.approvedMatrix || !requirementState?.skillMatrixApproved) {
    throw createError({ statusCode: 422, statusMessage: 'Approve the Skill Matrix before adding resumes to the AI Candidate Pool.' })
  }

  const formData = await readMultipartFormData(event)
  const fileParts = (formData ?? []).filter(part => (part.name === 'file' || part.name === 'files') && part.data && part.filename)
  if (!fileParts.length) throw createError({ statusCode: 400, statusMessage: 'Attach at least one PDF, DOC or DOCX resume.' })
  if (fileParts.length > MAX_BULK_RESUMES) {
    throw createError({ statusCode: 413, statusMessage: `Upload a maximum of ${MAX_BULK_RESUMES} resumes at a time.` })
  }

  const config = await loadAiConfig(orgId, { purpose: 'analysis' })
  const providerConfig = {
    provider: config.provider as SupportedProvider,
    model: config.model,
    apiKeyEncrypted: config.apiKeyEncrypted,
    baseUrl: config.baseUrl,
    maxTokens: config.maxTokens,
  }

  const results: Array<Record<string, unknown>> = []

  for (const filePart of fileParts) {
    const filename = sanitizeFilename(filePart.filename!)
    let storageKey: string | null = null
    let storedResumeDocumentId: string | null = null
    let storedCandidateId: string | null = null
    try {
      const fileBuffer = filePart.data
      if (fileBuffer.length === 0) throw new Error('Empty resume files cannot be uploaded')
      if (fileBuffer.length > MAX_FILE_SIZE) throw new Error(`File exceeds ${MAX_FILE_SIZE / 1024 / 1024} MB limit`)

      const detected = await fileTypeFromBuffer(fileBuffer)
      const mimeType = detectLegacyDoc(fileBuffer, detected?.mime)
      if (!mimeType || !ALLOWED_MIME_TYPES.includes(mimeType as typeof ALLOWED_MIME_TYPES[number])) {
        throw new Error('Invalid file type. Allowed: PDF, DOC, DOCX')
      }
      if (!isFilenameCompatibleWithMime(filePart.filename!, mimeType)) {
        throw new Error('Filename extension does not match the detected file type')
      }

      const parsedContent = await parseDocument(fileBuffer, mimeType)
      const resumeText = extractResumeText(parsedContent)
      if (!parsedContent || !resumeText) throw new Error('No readable resume text could be extracted')

      const fallback = inferResumeIdentity(resumeText, filename)
      let identity = {
        firstName: fallback.firstName,
        lastName: fallback.lastName,
        email: fallback.email,
        phone: fallback.phone,
      }

      try {
        // Identity/contact details are normally near the resume header. Limiting the
        // untrusted text reduces prompt-injection surface and unnecessary AI cost.
        const identityText = resumeText.slice(0, 20_000)
        const aiIdentity = await extractCandidateIdentity(providerConfig, identityText)
        const aiNameSupported = isNameSupportedByResume(aiIdentity.firstName, aiIdentity.lastName, identityText)
        identity = {
          firstName: aiNameSupported ? aiIdentity.firstName : fallback.firstName,
          lastName: aiNameSupported ? aiIdentity.lastName : fallback.lastName,
          email: emailIsInResume(aiIdentity.email, identityText) ? aiIdentity.email : fallback.email,
          phone: phoneIsInResume(aiIdentity.phone, identityText) ? aiIdentity.phone : fallback.phone,
        }
      } catch {
        // Deterministic extraction remains the safe fallback.
      }

      const normalizedEmail = identity.email?.trim().toLowerCase() || null
      const normalizedPhoneDigits = phoneDigits(identity.phone)

      let candidateRecord = normalizedEmail
        ? await db.query.candidate.findFirst({
            where: and(eq(candidate.organizationId, orgId), ilike(candidate.email, normalizedEmail), isNull(candidate.quarantinedAt)),
            columns: { id: true, email: true, phone: true },
          })
        : undefined

      if (!candidateRecord && normalizedPhoneDigits) {
        const phoneCandidates = await db.query.candidate.findMany({
          where: and(eq(candidate.organizationId, orgId), isNull(candidate.quarantinedAt)),
          columns: { id: true, email: true, phone: true },
        })
        candidateRecord = phoneCandidates.find(row => phoneDigits(row.phone) === normalizedPhoneDigits)
      }

      let candidateCreated = false
      if (!candidateRecord) {
        if (!normalizedEmail) {
          throw new Error('No reliable email was found and the phone number does not match an existing candidate. Add contact details to the resume before importing this new candidate.')
        }
        if (!identity.firstName) {
          throw new Error('Candidate name could not be identified reliably. Rename the resume with the candidate name or enter the candidate manually rather than importing an uncertain identity.')
        }

        const [createdCandidate] = await db.insert(candidate).values({
          organizationId: orgId,
          firstName: identity.firstName,
          lastName: identity.lastName,
          email: normalizedEmail,
          phone: identity.phone || null,
        }).returning({ id: candidate.id, email: candidate.email, phone: candidate.phone })
        if (!createdCandidate) throw new Error('Candidate record could not be created')
        candidateRecord = createdCandidate
        candidateCreated = true
      }
      storedCandidateId = candidateRecord.id

      const existingDocCount = await db.$count(document, and(eq(document.candidateId, candidateRecord.id), eq(document.organizationId, orgId)))
      if (existingDocCount >= MAX_DOCUMENTS_PER_CANDIDATE) throw new Error(`Candidate document limit of ${MAX_DOCUMENTS_PER_CANDIDATE} reached`)

      const documentId = crypto.randomUUID()
      const extension = MIME_TO_EXTENSION[mimeType] ?? 'bin'
      storageKey = `${orgId}/${candidateRecord.id}/${documentId}.${extension}`
      await uploadToS3(storageKey, fileBuffer, mimeType)

      const [createdDocument] = await db.insert(document).values({
        id: documentId,
        organizationId: orgId,
        candidateId: candidateRecord.id,
        type: 'resume',
        storageKey,
        originalFilename: filename,
        mimeType,
        sizeBytes: fileBuffer.length,
        parsedContent: parsedContent as any,
      }).returning({ id: document.id })
      if (!createdDocument) throw new Error('Resume record could not be created')

      storedResumeDocumentId = createdDocument.id
      storageKey = null

      const generated = await generatePdsResumeAssessment(providerConfig, {
        jobTitle: jobRecord.title,
        jobDescription: jobRecord.description,
        skillMatrix: matrixRecord.approvedMatrix,
        resumeContent: parsedContent,
      })
      const ranking = calculateProvisionalFit({
        mandatoryScore: generated.mandatoryScore,
        preferredScore: generated.preferredScore,
        experienceScore: generated.experienceScore,
        optionalScore: generated.optionalScore,
      })

      const existingMatch = await db.query.talentPoolMatch.findFirst({
        where: and(eq(talentPoolMatch.organizationId, orgId), eq(talentPoolMatch.jobId, jobId), eq(talentPoolMatch.candidateId, candidateRecord.id)),
      })

      const now = new Date()
      const values = {
        organizationId: orgId,
        jobId,
        candidateId: candidateRecord.id,
        resumeDocumentId: createdDocument.id,
        requirementVersion: requirementState.revision,
        mandatoryScore: generated.mandatoryScore,
        preferredScore: generated.preferredScore,
        experienceScore: generated.experienceScore,
        optionalScore: generated.optionalScore,
        score: ranking.score,
        priority: ranking.priority,
        mandatoryMatch: generated.mandatoryMatch,
        keyStrength: generated.keyStrength,
        mainGap: generated.mainGap,
        candidateSnapshot: generated.candidateSnapshot,
        jdAlignment: generated.jdAlignment,
        skillAssessment: generated.skillAssessment,
        keyGaps: generated.keyGaps,
        verificationAreas: generated.verificationAreas,
        source: 'jd_upload' as const,
        assessedAt: now,
        updatedAt: now,
      }
      if (existingMatch) await db.update(talentPoolMatch).set(values).where(eq(talentPoolMatch.id, existingMatch.id))
      else await db.insert(talentPoolMatch).values(values)

      results.push({
        filename,
        status: ranking.score >= FINAL_POOL_THRESHOLD ? 'matched' : 'below_threshold',
        candidateId: candidateRecord.id,
        candidateCreated,
        resumeDocumentId: createdDocument.id,
        score: ranking.score,
        priority: ranking.priority,
      })
    } catch (error: any) {
      if (storageKey) {
        try { await deleteFromS3(storageKey) } catch { /* best-effort cleanup */ }
      }
      const stored = Boolean(storedResumeDocumentId && storedCandidateId)
      results.push({
        filename,
        status: stored ? 'stored_analysis_pending' : 'failed',
        candidateId: storedCandidateId,
        resumeDocumentId: storedResumeDocumentId,
        error: error?.data?.statusMessage ?? error?.message ?? 'Upload failed',
      })
    }
  }

  const matched = results.filter(row => row.status === 'matched').length
  const belowThreshold = results.filter(row => row.status === 'below_threshold').length
  const analysisPending = results.filter(row => row.status === 'stored_analysis_pending').length
  const failed = results.filter(row => row.status === 'failed').length

  return {
    jobId,
    threshold: FINAL_POOL_THRESHOLD,
    total: fileParts.length,
    matched,
    belowThreshold,
    analysisPending,
    failed,
    results,
  }
})
