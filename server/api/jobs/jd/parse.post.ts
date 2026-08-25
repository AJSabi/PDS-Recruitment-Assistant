import { fileTypeFromBuffer } from 'file-type'
import { parseDocument } from '../../../utils/resume-parser'
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  sanitizeFilename,
} from '../../../utils/schemas/document'

function detectLegacyDoc(buffer: Buffer, mimeType?: string) {
  if (mimeType) return mimeType
  const magic = Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])
  return buffer.length >= 8 && Buffer.compare(buffer.subarray(0, 8), magic) === 0
    ? 'application/msword'
    : undefined
}

export default defineEventHandler(async (event) => {
  await requirePermission(event, { job: ['create'] })

  const formData = await readMultipartFormData(event)
  const filePart = (formData ?? []).find(part => part.name === 'file' && part.data && part.filename)

  if (!filePart?.data || !filePart.filename) {
    throw createError({ statusCode: 400, statusMessage: 'Attach a JD in PDF, DOC or DOCX format.' })
  }

  if (filePart.data.length > MAX_FILE_SIZE) {
    throw createError({ statusCode: 413, statusMessage: `JD exceeds the ${MAX_FILE_SIZE / 1024 / 1024} MB file limit.` })
  }

  const detected = await fileTypeFromBuffer(filePart.data)
  const mimeType = detectLegacyDoc(filePart.data, detected?.mime)

  if (!mimeType || !ALLOWED_MIME_TYPES.includes(mimeType as typeof ALLOWED_MIME_TYPES[number])) {
    throw createError({ statusCode: 415, statusMessage: 'Invalid JD file type. Allowed: PDF, DOC and DOCX.' })
  }

  const parsed = await parseDocument(filePart.data, mimeType)
  if (!parsed?.text?.trim()) {
    throw createError({ statusCode: 422, statusMessage: 'No readable text could be extracted from this JD.' })
  }

  return {
    filename: sanitizeFilename(filePart.filename),
    mimeType,
    text: parsed.text,
    metadata: parsed.metadata,
  }
})
