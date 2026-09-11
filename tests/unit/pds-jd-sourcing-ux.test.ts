import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const sourcingGenerate = readFileSync('server/api/jobs/[id]/sourcing/generate.post.ts', 'utf8')
const sourcingPage = readFileSync('app/pages/dashboard/jobs/[id]/sourcing.vue', 'utf8')
const uploadPage = readFileSync('app/pages/dashboard/jobs/[id]/jd-upload.vue', 'utf8')
const uploadApi = readFileSync('server/api/jobs/[id]/jd/upload.post.ts', 'utf8')
const jobGet = readFileSync('server/api/jobs/[id].get.ts', 'utf8')
const useJob = readFileSync('app/composables/useJob.ts', 'utf8')

describe('PDS JD and sourcing recruiter UX', () => {
  it('allows sourcing generation directly from an Active JD before a Skill Matrix exists', () => {
    expect(sourcingGenerate).not.toContain('Save or generate the Skill Matrix before generating sourcing aids')
    expect(sourcingGenerate).toContain('matrixRecord?.approvedMatrix ?? matrixRecord?.matrix ?? null')
    expect(sourcingGenerate).toContain("matrix: matrixRecord?.matrix ?? { classifications: [] }")
  })

  it('provides governed JD upload and review for common recruiter documents', () => {
    expect(uploadApi).toContain("ext === 'docx'")
    expect(uploadApi).toContain("ext === 'pdf'")
    expect(uploadApi).toContain("['txt', 'md', 'rtf'].includes(ext)")
    expect(uploadApi).toContain("requirePermission(event, { job: ['update'] })")
    expect(uploadPage).toContain('Save as Active JD')
    expect(uploadPage).toContain("method: 'PATCH'")
  })

  it('keeps sourcing toolkit navigation inside a bounded job workspace', () => {
    expect(sourcingPage).toContain('max-w-7xl')
    expect(sourcingPage).toContain('Back to JD & Skill Matrix')
    expect(sourcingPage).toContain('Upload / Replace JD')
  })

  it('keeps Active JD detail lightweight and fresh', () => {
    expect(jobGet).not.toContain('with: {')
    expect(jobGet).not.toContain('applications: {')
    expect(useJob).not.toContain('getCachedData')
  })
})
