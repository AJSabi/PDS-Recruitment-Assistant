import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { fileTypeFromBuffer } from 'file-type'
import { document } from '../../../../database/schema'
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  MAX_DOCUMENTS_PER_CANDIDATE,
  MIME_TO_EXTENSION,
  documentTypeSchema,
  sanitizeFilename,
  isFilenameCompatibleWithMime,
} from '../../../../utils/schemas/document'
import { parseDocument } from '../../../../utils/resume-parser'
import { findActiveCandidate } from '../../../../utils/candidate-retention'

/**
 * POST /api/candidates/:id/documents
 * Upload PDF/DOC/DOCX documents with magic-byte validation and server-generated storage keys.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { document: ['create'] })
  const orgId = session.session.activeOrganizationId

  const { id: candidateId } = await getValidatedRouterParams(event, z.object({ id: z.string().uuid() }).parse)
  const existingCandidate = await findActiveCandidate(orgId, candidateId)
  if (!existingCandidate) {
    throw createError({ statusCode: 409, statusMessage: 'Candidate is quarantined or not found' })
  }

  const formData = await readMultipartFormData(event)
  if (!formData) throw createError({ statusCode: 400, statusMessage: 'No form data received' })

  const filePart = formData.find(part => part.name === 'file')
  const typePart = formData.find(part => part.name === 'type')
  if (!filePart?.data || !filePart.filename) {
    throw createError({ statusCode: 400, statusMessage: 'No file provided' })
  }

  const typeValue = typePart?.data?.toString() ?? 'resume'
  const typeResult = documentTypeSchema.safeParse(typeValue)
  if (!typeResult.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid document type. Must be: resume, cover_letter, or other' })
  }
  const documentType = typeResult.data

  const fileBuffer = filePart.data
  if (fileBuffer.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Empty files cannot be uploaded' })
  }
  if (fileBuffer.length > MAX_FILE_SIZE) {
    throw createError({
      statusCode: 413,
      statusMessage: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024} MB`,
    })
  }

  const detectedType = await fileTypeFromBuffer(fileBuffer)
  let mimeType = detectedType?.mime
  if (!mimeType) {
    const OLE2_MAGIC = Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])
    if (fileBuffer.length >= 8 && Buffer.compare(fileBuffer.subarray(0, 8), OLE2_MAGIC) === 0) {
      mimeType = 'application/msword'
    }
  }

  if (!mimeType || !ALLOWED_MIME_TYPES.includes(mimeType as typeof ALLOWED_MIME_TYPES[number])) {
    throw createError({ statusCode: 415, statusMessage: 'Invalid file type. Allowed: PDF, DOC, DOCX' })
  }
  if (!isFilenameCompatibleWithMime(filePart.filename, mimeType)) {
    throw createError({ statusCode: 415, statusMessage: 'Filename extension does not match the detected file type' })
  }

  const existingDocCount = await db.$count(
    document,
    and(eq(document.candidateId, candidateId), eq(document.organizationId, orgId)),
  )
  if (existingDocCount >= MAX_DOCUMENTS_PER_CANDIDATE) {
    throw createError({ statusCode: 409, statusMessage: `Document limit reached. Maximum ${MAX_DOCUMENTS_PER_CANDIDATE} documents per candidate` })
  }

  const documentId = crypto.randomUUID()
  const extension = MIME_TO_EXTENSION[mimeType] ?? 'bin'
  const storageKey = `${orgId}/${candidateId}/${documentId}.${extension}`
  await uploadToS3(storageKey, fileBuffer, mimeType)

  const parsedContent = await parseDocument(fileBuffer, mimeType)

  try {
    const [created] = await db.insert(document).values({
      id: documentId,
      organizationId: orgId,
      candidateId,
      type: documentType,
      storageKey,
      originalFilename: sanitizeFilename(filePart.filename),
      mimeType,
      sizeBytes: fileBuffer.length,
      parsedContent: parsedContent as any,
    }).returning({
      id: document.id,
      type: document.type,
      originalFilename: document.originalFilename,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      createdAt: document.createdAt,
    })

    if (!created) throw createError({ statusCode: 500, statusMessage: 'Failed to create document' })

    recordActivity({
      organizationId: orgId,
      actorId: session.user.id,
      action: 'created',
      resourceType: 'document',
      resourceId: created.id,
      metadata: { candidateId, filename: created.originalFilename, type: created.type },
    })

    setResponseStatus(event, 201)
    return created
  } catch (dbError) {
    try {
      await deleteFromS3(storageKey)
    } catch (cleanupError) {
      logWarn('document.s3_orphan_cleanup_failed', {
        storage_key: storageKey,
        error_message: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
      })
    }
    throw dbError
  }
})
