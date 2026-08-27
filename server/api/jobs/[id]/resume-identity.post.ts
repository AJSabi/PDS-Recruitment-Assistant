import { fileTypeFromBuffer } from 'file-type'
import { assertRequirementAccess } from '../../../utils/recruitmentVisibility'
import { parseDocument, extractResumeText } from '../../../utils/resume-parser'
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE, sanitizeFilename } from '../../../utils/schemas/document'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })

function detectLegacyDoc(buffer: Buffer, mimeType?: string) {
  if (mimeType) return mimeType
  const magic = Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])
  return buffer.length >= 8 && Buffer.compare(buffer.subarray(0, 8), magic) === 0
    ? 'application/msword'
    : undefined
}

function inferIdentity(resumeText: string, filename: string) {
  const email = resumeText.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0]?.toLowerCase() ?? null
  const phoneCandidate = resumeText.match(/(?:\+?\d[\d\s().-]{8,}\d)/)?.[0]?.trim() ?? null
  const phone = phoneCandidate && phoneCandidate.replace(/\D/g, '').length >= 10 ? phoneCandidate : null

  const possibleName = resumeText.split('\n').slice(0, 15).map(line => line.trim()).find((line) => {
    if (!line || line.length > 80 || /@|\d/.test(line)) return false
    if (/resume|curriculum|profile|summary|experience|contact|email|phone/i.test(line)) return false
    const words = line.split(/\s+/).filter(Boolean)
    return words.length >= 2 && words.length <= 5 && words.every(word => /^[A-Za-z.'-]+$/.test(word))
  })
  const filenameName = filename.replace(/\.(pdf|docx?|rtf)$/i, '').replace(/[_-]+/g, ' ').trim()
  const parts = (possibleName || filenameName).split(/\s+/).filter(Boolean)

  return {
    firstName: parts[0]?.slice(0, 100) ?? '',
    lastName: parts.slice(1).join(' ').slice(0, 100),
    email,
    phone,
  }
}

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { candidate: ['create'], document: ['create'] })
  const orgId = session.session.activeOrganizationId
  const { id: jobId } = await getValidatedRouterParams(event, paramsSchema.parse)
  await assertRequirementAccess(orgId, session.user.id, jobId)

  const formData = await readMultipartFormData(event)
  const filePart = (formData ?? []).find(part => part.name === 'file' && part.data && part.filename)
  if (!filePart?.data || !filePart.filename) {
    throw createError({ statusCode: 400, statusMessage: 'Attach a PDF, DOC or DOCX resume.' })
  }
  if (filePart.data.length > MAX_FILE_SIZE) {
    throw createError({ statusCode: 413, statusMessage: `Resume exceeds the ${MAX_FILE_SIZE / 1024 / 1024} MB file limit.` })
  }

  const detected = await fileTypeFromBuffer(filePart.data)
  const mimeType = detectLegacyDoc(filePart.data, detected?.mime)
  if (!mimeType || !ALLOWED_MIME_TYPES.includes(mimeType as typeof ALLOWED_MIME_TYPES[number])) {
    throw createError({ statusCode: 415, statusMessage: 'Invalid resume file type. Allowed: PDF, DOC and DOCX.' })
  }

  const parsed = await parseDocument(filePart.data, mimeType)
  const resumeText = extractResumeText(parsed)
  if (!resumeText) throw createError({ statusCode: 422, statusMessage: 'No readable text could be extracted from this resume.' })

  return {
    filename: sanitizeFilename(filePart.filename),
    identity: inferIdentity(resumeText, filePart.filename),
  }
})
