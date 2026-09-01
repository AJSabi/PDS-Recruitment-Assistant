import { describe, expect, it } from 'vitest'
import { MAX_FILE_SIZE } from '../../server/utils/schemas/document'
import { MAX_EXTRACTED_TEXT_LENGTH, parseDocument } from '../../server/utils/resume-parser'

describe('resume parser security bounds', () => {
  it('rejects empty parser input before invoking a document parser', async () => {
    await expect(parseDocument(Buffer.alloc(0), 'application/pdf')).resolves.toBeNull()
  })

  it('rejects parser input larger than the governed document upload limit', async () => {
    const oversized = Buffer.alloc(MAX_FILE_SIZE + 1)
    await expect(parseDocument(oversized, 'application/pdf')).resolves.toBeNull()
  })

  it('keeps extracted resume text within a bounded production ceiling', () => {
    expect(MAX_EXTRACTED_TEXT_LENGTH).toBe(1_000_000)
    expect(MAX_EXTRACTED_TEXT_LENGTH).toBeGreaterThan(100_000)
  })
})
