import { z } from 'zod'

// ─────────────────────────────────────────────
// Document validation schemas & constants
// ─────────────────────────────────────────────

/** MIME types allowed for document upload. */
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const

/** Maximum file size in bytes (10 MB) */
export const MAX_FILE_SIZE = 10 * 1024 * 1024

/** Maximum number of documents per candidate */
export const MAX_DOCUMENTS_PER_CANDIDATE = 20

/** Map validated MIME types to safe server-side extensions. */
export const MIME_TO_EXTENSION: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
}

/** Schema for the document type field (matches the DB enum) */
export const documentTypeSchema = z.enum(['resume', 'cover_letter', 'other'])

/**
 * Ensure the user-facing filename extension agrees with magic-byte MIME detection.
 * This rejects disguised or accidentally mislabelled executable/archive uploads.
 */
export function isFilenameCompatibleWithMime(filename: string, mimeType: string): boolean {
  const expected = MIME_TO_EXTENSION[mimeType]
  if (!expected) return false
  const match = filename.trim().match(/\.([A-Za-z0-9]+)$/)
  if (!match?.[1]) return false
  return match[1].toLowerCase() === expected
}

/**
 * Sanitize a user-provided filename for safe storage and display.
 * Never use raw user-supplied filenames as a storage key.
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[<>:"'\/\\|?*\x00-\x1f]/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 255)
    || 'unnamed'
}
