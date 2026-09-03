import { z } from 'zod'
import mammoth from 'mammoth'
import { PDFParse } from 'pdf-parse'
import { assertRequirementAccess } from '../../../../utils/recruitmentVisibility'

const paramsSchema = z.object({ id: z.string().min(1) })
const MAX_JD_BYTES = 6 * 1024 * 1024

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { job: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { id: jobId } = await getValidatedRouterParams(event, paramsSchema.parse)
  await assertRequirementAccess(orgId, session.user.id, jobId)

  const parts = await readMultipartFormData(event)
  const file = parts?.find(part => part.name === 'file' && part.data?.length)
  if (!file) throw createError({ statusCode: 422, statusMessage: 'Select a JD file to upload.' })
  if (file.data.length > MAX_JD_BYTES) throw createError({ statusCode: 413, statusMessage: 'JD file must be 6 MB or smaller.' })

  const filename = file.filename ?? 'jd'
  const ext = filename.toLowerCase().split('.').pop() ?? ''
  let text = ''

  try {
    if (ext === 'docx') {
      const result = await mammoth.extractRawText({ buffer: Buffer.from(file.data) })
      text = result.value
    } else if (ext === 'pdf') {
      const parser = new PDFParse({ data: Buffer.from(file.data) })
      try {
        const result = await parser.getText()
        text = result.text
      } finally {
        await parser.destroy()
      }
    } else if (['txt', 'md', 'rtf'].includes(ext)) {
      text = Buffer.from(file.data).toString('utf8')
    } else {
      throw createError({ statusCode: 415, statusMessage: 'Upload PDF, DOCX, TXT, MD or RTF JD files.' })
    }
  } catch (error: any) {
    if (error?.statusCode) throw error
    throw createError({ statusCode: 422, statusMessage: 'Could not read this JD file. Try a text-based PDF/DOCX or paste the JD manually.' })
  }

  const cleaned = text.replace(/\u0000/g, '').replace(/\r\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim()
  if (cleaned.length < 40) throw createError({ statusCode: 422, statusMessage: 'Very little readable JD text was found in the uploaded file.' })
  if (cleaned.length > 50000) throw createError({ statusCode: 422, statusMessage: 'JD text is too long. Keep the active JD under 50,000 characters.' })

  return { filename, text: cleaned, characters: cleaned.length }
})
