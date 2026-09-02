import { eq, and, asc, sql } from 'drizzle-orm'
import { fileTypeFromBuffer } from 'file-type'
import { job, candidate, application, jobQuestion, questionResponse, document, organization, applicationSource, trackingLink, retentionAudit } from '../../../../database/schema'
import { publicApplicationSchema, publicJobSlugSchema } from '../../../../utils/schemas/publicApplication'
import { createPreviewReadOnlyError } from '../../../../utils/previewReadOnly'
import { autoScoreApplication } from '../../../../utils/ai/autoScore'
import { parseDocument } from '../../../../utils/resume-parser'
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  MAX_DOCUMENTS_PER_CANDIDATE,
  MIME_TO_EXTENSION,
  sanitizeFilename,
} from '../../../../utils/schemas/document'

/** Rate limit: max 5 applications per IP per 15 minutes */
const applyRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 5,
  message: 'Too many applications submitted. Please try again later.',
})

type PreparedDocument = {
  id: string
  storageKey: string
  type: 'resume' | 'cover_letter' | 'other'
  originalFilename: string
  mimeType: string
  sizeBytes: number
  parsedContent: Awaited<ReturnType<typeof parseDocument>> | null
  questionId?: string
}

/**
 * POST /api/public/jobs/:slug/apply
 * Public application submission endpoint. No auth required.
 *
 * All request validation and document-limit checks happen before application
 * creation. S3 objects are prepared first and compensated on failure; candidate,
 * application, answers and document records are then committed in one DB
 * transaction so callers never receive an error after a partial application was
 * persisted.
 */
export default defineEventHandler(async (event) => {
  if (process.env.NODE_ENV === 'production' && !process.env.CI && !process.env.GITHUB_ACTIONS) {
    await applyRateLimit(event)
  }

  const { slug } = await getValidatedRouterParams(event, publicJobSlugSchema.parse)
  const contentType = getHeader(event, 'content-type') ?? ''
  const isMultipart = contentType.includes('multipart/form-data')

  let firstName: string
  let lastName: string
  let email: string
  let phone: string | undefined
  let website: string | undefined
  let responseArray: { questionId: string; value: string | string[] | number | boolean }[] = []
  let coverLetterText: string | undefined
  let sourceRef: string | undefined
  let utmSource: string | undefined
  let utmMedium: string | undefined
  let utmCampaign: string | undefined
  let utmTerm: string | undefined
  let utmContent: string | undefined
  const uploadedFiles: Map<string, { data: Buffer; filename: string; type?: string }> = new Map()
  let resumeUpload: { data: Buffer; filename: string; type?: string } | null = null

  if (isMultipart) {
    const formData = await readMultipartFormData(event)
    if (!formData) {
      throw createError({ statusCode: 400, statusMessage: 'No form data received' })
    }

    const fields: Record<string, string> = {}
    for (const part of formData) {
      if (!part.name) continue
      if (part.name === 'resume') {
        if (part.data && part.filename) {
          resumeUpload = { data: Buffer.from(part.data), filename: part.filename, type: part.type }
        }
      } else if (part.name.startsWith('file:')) {
        const questionId = part.name.slice(5)
        if (part.data && part.filename) {
          uploadedFiles.set(questionId, {
            data: Buffer.from(part.data),
            filename: part.filename,
            type: part.type,
          })
        }
      } else {
        fields[part.name] = part.data.toString()
      }
    }

    let rawResponses: unknown[] = []
    if (fields.responses) {
      try {
        rawResponses = JSON.parse(fields.responses)
      } catch {
        throw createError({ statusCode: 400, statusMessage: 'Invalid responses format' })
      }
    }

    const validated = publicApplicationSchema.parse({
      firstName: fields.firstName?.trim() ?? '',
      lastName: fields.lastName?.trim() ?? '',
      email: fields.email?.trim() ?? '',
      phone: fields.phone?.trim() || undefined,
      website: fields.website || undefined,
      coverLetterText: fields.coverLetterText?.trim() || undefined,
      responses: rawResponses,
      ref: fields.ref || undefined,
      utmSource: fields.utmSource || undefined,
      utmMedium: fields.utmMedium || undefined,
      utmCampaign: fields.utmCampaign || undefined,
      utmTerm: fields.utmTerm || undefined,
      utmContent: fields.utmContent || undefined,
    })

    firstName = validated.firstName
    lastName = validated.lastName
    email = validated.email
    phone = validated.phone
    website = validated.website
    coverLetterText = validated.coverLetterText
    responseArray = validated.responses
    sourceRef = validated.ref
    utmSource = validated.utmSource
    utmMedium = validated.utmMedium
    utmCampaign = validated.utmCampaign
    utmTerm = validated.utmTerm
    utmContent = validated.utmContent
  } else {
    const body = await readValidatedBody(event, publicApplicationSchema.parse)
    firstName = body.firstName
    lastName = body.lastName
    email = body.email
    phone = body.phone
    website = body.website
    coverLetterText = body.coverLetterText
    responseArray = body.responses
    sourceRef = body.ref
    utmSource = body.utmSource
    utmMedium = body.utmMedium
    utmCampaign = body.utmCampaign
    utmTerm = body.utmTerm
    utmContent = body.utmContent
  }

  if (website) {
    setResponseStatus(event, 200)
    return { success: true }
  }

  const existingJob = await db.query.job.findFirst({
    where: and(eq(job.slug, slug), eq(job.status, 'open')),
    columns: {
      id: true,
      organizationId: true,
      phoneRequirement: true,
      requireResume: true,
      requireCoverLetter: true,
      autoScoreOnApply: true,
    },
  })

  if (!existingJob) {
    throw createError({ statusCode: 404, statusMessage: 'Job not found or not accepting applications' })
  }

  if (existingJob.phoneRequirement === 'required' && !phone?.trim()) {
    throw createError({ statusCode: 422, statusMessage: 'Phone number is required for this position' })
  }
  if (existingJob.phoneRequirement === 'hidden') phone = undefined
  if (existingJob.requireResume && !resumeUpload) {
    throw createError({ statusCode: 422, statusMessage: 'Resume/CV is required for this position' })
  }
  if (existingJob.requireCoverLetter && !coverLetterText?.trim()) {
    throw createError({ statusCode: 422, statusMessage: 'Cover letter is required for this position' })
  }

  const orgId = existingJob.organizationId
  const jobId = existingJob.id

  if (env.DEMO_ORG_SLUG) {
    const [demoOrg] = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, env.DEMO_ORG_SLUG))
      .limit(1)
    if (demoOrg?.id === orgId) throw createPreviewReadOnlyError()
  }

  const questions = await db.query.jobQuestion.findMany({
    where: and(eq(jobQuestion.jobId, jobId), eq(jobQuestion.organizationId, orgId)),
    orderBy: [asc(jobQuestion.displayOrder)],
  })

  const requiredQuestionIds = questions.filter(q => q.required).map(q => q.id)
  const answeredIds = new Set(responseArray.map(r => r.questionId))
  const fileQuestions = questions.filter(q => q.type === 'file_upload')
  const fileQuestionIds = new Set(fileQuestions.map(q => q.id))
  const requiredFileQuestionIds = new Set(fileQuestions.filter(q => q.required).map(q => q.id))

  const unanswered = requiredQuestionIds.filter((id) => {
    if (fileQuestionIds.has(id)) return !uploadedFiles.has(id)
    return !answeredIds.has(id)
  })

  if (unanswered.length > 0) {
    const unansweredLabels = questions.filter(q => unanswered.includes(q.id)).map(q => q.label)
    throw createError({
      statusCode: 422,
      statusMessage: `Missing required answers: ${unansweredLabels.join(', ')}`,
    })
  }

  const validQuestionIds = new Set(questions.map(q => q.id))
  const validResponses = responseArray.filter(r => validQuestionIds.has(r.questionId))

  for (const [questionId, file] of uploadedFiles) {
    if (!fileQuestionIds.has(questionId)) {
      uploadedFiles.delete(questionId)
      continue
    }
    if (file.data.length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'Empty files cannot be uploaded' })
    }
    if (file.data.length > MAX_FILE_SIZE) {
      throw createError({
        statusCode: 413,
        statusMessage: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024} MB`,
      })
    }

    const detectedType = await fileTypeFromBuffer(file.data)
    let mimeType = detectedType?.mime
    if (!mimeType || mimeType === 'application/x-cfb') {
      const OLE2_MAGIC = Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])
      if (file.data.length >= 8 && Buffer.compare(file.data.subarray(0, 8), OLE2_MAGIC) === 0) {
        mimeType = 'application/msword'
      }
    }
    if (!mimeType || !ALLOWED_MIME_TYPES.includes(mimeType as typeof ALLOWED_MIME_TYPES[number])) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid file type. Allowed: PDF, DOC, DOCX' })
    }
    file.type = mimeType
  }

  let resumeMimeType: string | undefined
  if (resumeUpload) {
    if (resumeUpload.data.length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'Empty resume files cannot be uploaded' })
    }
    if (resumeUpload.data.length > MAX_FILE_SIZE) {
      throw createError({
        statusCode: 413,
        statusMessage: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024} MB`,
      })
    }
    const detectedType = await fileTypeFromBuffer(resumeUpload.data)
    resumeMimeType = detectedType?.mime
    if (!resumeMimeType || resumeMimeType === 'application/x-cfb') {
      const OLE2_MAGIC = Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])
      if (resumeUpload.data.length >= 8 && Buffer.compare(resumeUpload.data.subarray(0, 8), OLE2_MAGIC) === 0) {
        resumeMimeType = 'application/msword'
      }
    }
    if (!resumeMimeType || !ALLOWED_MIME_TYPES.includes(resumeMimeType as typeof ALLOWED_MIME_TYPES[number])) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid file type for resume. Allowed: PDF, DOC, DOCX' })
    }
  }

  const normalizedEmail = email.toLowerCase()
  const existingCandidate = await db.query.candidate.findFirst({
    where: and(eq(candidate.organizationId, orgId), eq(candidate.email, normalizedEmail)),
    columns: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      quarantinedAt: true,
    },
  })

  const candidateId = existingCandidate?.id ?? crypto.randomUUID()
  const restoreFromQuarantine = Boolean(existingCandidate?.quarantinedAt)

  if (existingCandidate) {
    const existingApplication = await db.query.application.findFirst({
      where: and(
        eq(application.organizationId, orgId),
        eq(application.candidateId, candidateId),
        eq(application.jobId, jobId),
      ),
      columns: { id: true },
    })
    if (existingApplication) {
      throw createError({ statusCode: 409, statusMessage: 'You have already applied to this position' })
    }
  }

  const totalNewFiles = uploadedFiles.size + (resumeUpload ? 1 : 0)
  if (totalNewFiles > 0) {
    const existingDocCount = existingCandidate
      ? await db.$count(document, and(eq(document.candidateId, candidateId), eq(document.organizationId, orgId)))
      : 0
    if (existingDocCount + totalNewFiles > MAX_DOCUMENTS_PER_CANDIDATE) {
      throw createError({
        statusCode: 409,
        statusMessage: `Document limit reached. Maximum ${MAX_DOCUMENTS_PER_CANDIDATE} documents per candidate`,
      })
    }
  }

  const preparedDocuments: PreparedDocument[] = []

  async function cleanupPreparedDocuments() {
    await Promise.all(preparedDocuments.map(async (prepared) => {
      try {
        await deleteFromS3(prepared.storageKey)
      } catch (cleanupError) {
        logWarn('application.s3_orphan_cleanup_failed', {
          storage_key: prepared.storageKey,
          error_message: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        })
      }
    }))
  }

  async function prepareDocument(
    file: { data: Buffer; filename: string },
    mimeType: string,
    type: PreparedDocument['type'],
    questionId?: string,
  ) {
    const id = crypto.randomUUID()
    const extension = MIME_TO_EXTENSION[mimeType] ?? 'bin'
    const storageKey = `${orgId}/${candidateId}/${id}.${extension}`
    await uploadToS3(storageKey, file.data, mimeType)

    let parsedContent: Awaited<ReturnType<typeof parseDocument>> | null = null
    try {
      parsedContent = await parseDocument(file.data, mimeType)
    } catch (parseError) {
      logWarn('application.document_parse_failed', {
        job_id: jobId,
        document_id: id,
        question_id: questionId ?? null,
        error_message: parseError instanceof Error ? parseError.message : String(parseError),
      })
    }

    const prepared: PreparedDocument = {
      id,
      storageKey,
      type,
      originalFilename: sanitizeFilename(file.filename),
      mimeType,
      sizeBytes: file.data.length,
      parsedContent,
      questionId,
    }
    preparedDocuments.push(prepared)
    return prepared
  }

  for (const [questionId, file] of uploadedFiles) {
    const question = questions.find(q => q.id === questionId)
    const label = question?.label?.toLowerCase() ?? ''
    let docType: PreparedDocument['type'] = 'other'
    if (label.includes('resume') || label.includes('cv')) docType = 'resume'
    else if (label.includes('cover letter')) docType = 'cover_letter'

    try {
      await prepareDocument(file, file.type!, docType, questionId)
    } catch (uploadError) {
      logError('application.file_upload_failed', {
        job_id: jobId,
        question_id: questionId,
        error_message: uploadError instanceof Error ? uploadError.message : String(uploadError),
      })
      if (requiredFileQuestionIds.has(questionId)) {
        await cleanupPreparedDocuments()
        throw createError({
          statusCode: 502,
          statusMessage: 'A required application document could not be uploaded. Please try again.',
        })
      }
    }
  }

  if (resumeUpload) {
    try {
      await prepareDocument(resumeUpload, resumeMimeType!, 'resume')
    } catch (uploadError) {
      logError('application.resume_upload_failed', {
        job_id: jobId,
        error_message: uploadError instanceof Error ? uploadError.message : String(uploadError),
      })
      await cleanupPreparedDocuments()
      throw createError({ statusCode: 502, statusMessage: 'Failed to upload your resume. Please try again.' })
    }
  }

  let newApplication: { id: string } | undefined
  try {
    newApplication = await db.transaction(async (tx) => {
      if (existingCandidate) {
        const now = new Date()
        const updates: Record<string, unknown> = { updatedAt: now }
        if (!existingCandidate.firstName) updates.firstName = firstName
        if (!existingCandidate.lastName) updates.lastName = lastName
        if (!existingCandidate.phone && phone) updates.phone = phone
        if (restoreFromQuarantine) {
          updates.quarantinedAt = null
          updates.scheduledPurgeAt = null
          updates.retentionReviewedAt = now
        }

        const [candidateUpdated] = await tx.update(candidate)
          .set(updates)
          .where(and(eq(candidate.id, candidateId), eq(candidate.organizationId, orgId)))
          .returning({ id: candidate.id })
        if (!candidateUpdated) throw new Error('Candidate no longer exists')

        if (restoreFromQuarantine) {
          await tx.insert(retentionAudit).values({
            organizationId: orgId,
            candidateId,
            action: 'restored',
            result: 'success',
            actorId: null,
            metadata: { source: 'public_application' },
          })
        }
      } else {
        await tx.insert(candidate).values({
          id: candidateId,
          organizationId: orgId,
          firstName,
          lastName,
          email: normalizedEmail,
          phone,
        })
      }

      const [createdApplication] = await tx.insert(application).values({
        organizationId: orgId,
        candidateId,
        jobId,
        status: 'new',
        coverLetterText: coverLetterText || null,
      }).returning({ id: application.id })
      if (!createdApplication) throw new Error('Failed to create application')

      if (validResponses.length > 0) {
        await tx.insert(questionResponse).values(validResponses.map(r => ({
          organizationId: orgId,
          applicationId: createdApplication.id,
          questionId: r.questionId,
          value: r.value,
        })))
      }

      for (const prepared of preparedDocuments) {
        await tx.insert(document).values({
          id: prepared.id,
          organizationId: orgId,
          candidateId,
          type: prepared.type,
          storageKey: prepared.storageKey,
          originalFilename: prepared.originalFilename,
          mimeType: prepared.mimeType,
          sizeBytes: prepared.sizeBytes,
          parsedContent: prepared.parsedContent as any,
        })
        if (prepared.questionId) {
          await tx.insert(questionResponse).values({
            organizationId: orgId,
            applicationId: createdApplication.id,
            questionId: prepared.questionId,
            value: prepared.id,
          })
        }
      }

      return createdApplication
    })
  } catch (transactionError) {
    await cleanupPreparedDocuments()
    logError('application.transaction_failed', {
      job_id: jobId,
      candidate_id: candidateId,
      error_message: transactionError instanceof Error ? transactionError.message : String(transactionError),
    })
    throw createError({ statusCode: 500, statusMessage: 'Your application could not be saved. Please try again.' })
  }

  if (restoreFromQuarantine) {
    logInfo('retention.candidate_restored_on_application', {
      org_id: orgId,
      candidate_id: candidateId,
      application_id: newApplication.id,
    })
  }

  try {
    const refererHeader = getHeader(event, 'referer') || getHeader(event, 'referrer')
    const referrerDomain = refererHeader ? extractDomain(refererHeader) : null
    let resolvedLink: { id: string; channel: typeof trackingLink.$inferSelect['channel'] } | null = null

    if (sourceRef) {
      const found = await db.query.trackingLink.findFirst({
        where: and(eq(trackingLink.code, sourceRef), eq(trackingLink.organizationId, orgId)),
        columns: { id: true, channel: true },
      })
      if (found) {
        resolvedLink = found
        await db.update(trackingLink)
          .set({ applicationCount: sql`${trackingLink.applicationCount} + 1` })
          .where(eq(trackingLink.id, found.id))
      }
    }

    const channel = resolvedLink?.channel
      ?? mapUtmToChannel(utmSource)
      ?? mapReferrerToChannel(referrerDomain)
      ?? 'direct'

    await db.insert(applicationSource).values({
      organizationId: orgId,
      applicationId: newApplication.id,
      channel: channel as typeof applicationSource.$inferInsert.channel,
      trackingLinkId: resolvedLink?.id ?? null,
      utmSource: utmSource ?? null,
      utmMedium: utmMedium ?? null,
      utmCampaign: utmCampaign ?? null,
      utmTerm: utmTerm ?? null,
      utmContent: utmContent ?? null,
      referrerDomain,
    })
  } catch (sourceErr) {
    logWarn('application.source_tracking_failed', {
      application_id: newApplication.id,
      error_message: sourceErr instanceof Error ? sourceErr.message : String(sourceErr),
    })
  }

  if (existingJob.autoScoreOnApply) {
    autoScoreApplication(newApplication.id, orgId).catch((err) => {
      logError('application.auto_score_failed', {
        application_id: newApplication!.id,
        job_id: jobId,
        error_message: err instanceof Error ? err.message : String(err),
      })
    })
  }

  trackEvent(event, null, 'application received', {
    job_slug: slug,
    job_id: existingJob.id,
    application_id: newApplication.id,
    has_resume: !!resumeUpload,
    auto_score_enabled: !!existingJob.autoScoreOnApply,
  })

  logApiRequest(event, null, 'application.received', {
    job_slug: slug,
    job_id: existingJob.id,
    application_id: newApplication.id,
    has_resume: !!resumeUpload,
    question_count: validResponses.length,
    file_count: preparedDocuments.length,
    auto_score_enabled: !!existingJob.autoScoreOnApply,
    is_returning_candidate: !!existingCandidate,
  })

  setResponseStatus(event, 201)
  return { success: true }
})

/** Extract domain from a URL, stripping www. prefix. Returns null on invalid URLs. */
function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url)
    return parsed.hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

/** Map common utm_source values to canonical source channels */
function mapUtmToChannel(utmSource: string | undefined): string | null {
  if (!utmSource) return null
  const source = utmSource.toLowerCase().trim()
  const mapping: Record<string, string> = {
    linkedin: 'linkedin',
    indeed: 'indeed',
    glassdoor: 'glassdoor',
    ziprecruiter: 'ziprecruiter',
    monster: 'monster',
    handshake: 'handshake',
    angellist: 'angellist',
    wellfound: 'wellfound',
    dice: 'dice',
    stackoverflow: 'stackoverflow',
    'stack overflow': 'stackoverflow',
    weworkremotely: 'weworkremotely',
    remoteok: 'remoteok',
    'remote ok': 'remoteok',
    builtin: 'builtin',
    hired: 'hired',
    lever: 'lever',
    greenhouse: 'greenhouse_board',
    'google jobs': 'google_jobs',
    google_jobs: 'google_jobs',
    facebook: 'facebook',
    twitter: 'twitter',
    x: 'twitter',
    instagram: 'instagram',
    tiktok: 'tiktok',
    reddit: 'reddit',
    referral: 'referral',
    email: 'email',
    newsletter: 'email',
    event: 'event',
    agency: 'agency',
  }
  return mapping[source] ?? null
}

/** Map referrer domains to canonical source channels */
function mapReferrerToChannel(domain: string | null): string | null {
  if (!domain) return null
  const d = domain.toLowerCase()
  const mapping: Record<string, string> = {
    'linkedin.com': 'linkedin',
    'indeed.com': 'indeed',
    'glassdoor.com': 'glassdoor',
    'ziprecruiter.com': 'ziprecruiter',
    'monster.com': 'monster',
    'joinhandshake.com': 'handshake',
    'angel.co': 'angellist',
    'wellfound.com': 'wellfound',
    'dice.com': 'dice',
    'stackoverflow.com': 'stackoverflow',
    'weworkremotely.com': 'weworkremotely',
    'remoteok.com': 'remoteok',
    'builtin.com': 'builtin',
    'hired.com': 'hired',
    'lever.co': 'lever',
    'boards.greenhouse.io': 'greenhouse_board',
    'jobs.google.com': 'google_jobs',
    'google.com': 'google_jobs',
    'facebook.com': 'facebook',
    'twitter.com': 'twitter',
    'x.com': 'twitter',
    'instagram.com': 'instagram',
    'tiktok.com': 'tiktok',
    'reddit.com': 'reddit',
  }
  if (mapping[d]) return mapping[d]!
  for (const [key, channel] of Object.entries(mapping)) {
    if (d.endsWith(`.${key}`) || d === key) return channel
  }
  return null
}
