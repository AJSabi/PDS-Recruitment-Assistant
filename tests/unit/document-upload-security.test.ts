import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { isFilenameCompatibleWithMime } from '../../server/utils/schemas/document'

describe('document upload security', () => {
  it('requires filename extension to match detected MIME', () => {
    expect(isFilenameCompatibleWithMime('resume.pdf', 'application/pdf')).toBe(true)
    expect(isFilenameCompatibleWithMime('RESUME.PDF', 'application/pdf')).toBe(true)
    expect(isFilenameCompatibleWithMime('resume.doc', 'application/msword')).toBe(true)
    expect(isFilenameCompatibleWithMime('resume.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(true)
    expect(isFilenameCompatibleWithMime('resume.exe', 'application/pdf')).toBe(false)
    expect(isFilenameCompatibleWithMime('resume.docx', 'application/pdf')).toBe(false)
    expect(isFilenameCompatibleWithMime('resume', 'application/pdf')).toBe(false)
  })

  it('stores documents as private non-cacheable attachments', () => {
    const source = readFileSync('server/utils/s3.ts', 'utf8')
    expect(source).toContain("ContentDisposition: 'attachment'")
    expect(source).toContain("CacheControl: 'private, no-store'")
  })

  it('keeps bulk resume ingestion bounded and type checked', () => {
    const source = readFileSync('server/api/jobs/[id]/talent-pool/upload.post.ts', 'utf8')
    expect(source).toContain('MAX_BULK_RESUMES = 20')
    expect(source).toContain('isFilenameCompatibleWithMime')
    expect(source).toContain('fileBuffer.length === 0')
  })
})
