import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(path, 'utf8')

describe('PDS audit security regressions', () => {
  it('keeps management analytics restricted to recruitment administrators', () => {
    for (const path of [
      'server/api/recruitment/overview.get.ts',
      'server/api/recruitment/workload.get.ts',
      'server/api/recruitment/assignments.get.ts',
      'server/api/recruitment/recruiters.get.ts',
      'server/api/recruitment/tat.get.ts',
    ]) {
      expect(read(path)).toContain('assertRecruitmentAdmin(orgId, session.user.id)')
    }
  })

  it('enforces requirement visibility when creating comments', () => {
    const source = read('server/api/comments/index.post.ts')
    expect(source).toContain('assertCommentTargetAccess')
    expect(source).toContain('await assertCommentTargetAccess(orgId, session.user.id, body.targetType, body.targetId)')
  })

  it('prevents recruiters from using chatbot organization scope or unallocated job scope', () => {
    const source = read('server/api/chatbot/chat.post.ts')
    expect(source).toContain('getRequirementVisibility(orgId, session.user.id)')
    expect(source).toContain("body.scope.kind === 'organization' && !visibility.canSeeAll")
    expect(source).toContain('await assertRequirementAccess(orgId, session.user.id, body.scope.jobId)')
  })

  it('starts TAT only from actual allocation', () => {
    const source = read('server/api/recruitment/tat.get.ts')
    expect(source).not.toContain('?? requirement.createdAt')
    expect(source).toContain('const assignmentDate = state?.ownerUserId && state.assignmentDate ? state.assignmentDate : null')
    expect(source).toContain('const allocated = Boolean(assignmentDate)')
    expect(source).toContain('unallocated: rows.filter(row => !row.allocated).length')
  })

  it('commits public application core records transactionally after upload validation', () => {
    const source = read('server/api/public/jobs/[slug]/apply.post.ts')
    expect(source).toContain('existingDocCount + totalNewFiles > MAX_DOCUMENTS_PER_CANDIDATE')
    expect(source).toContain('newApplication = await db.transaction(async (tx) =>')
    expect(source).toContain('requiredFileQuestionIds.has(questionId)')
    expect(source).toContain('await cleanupPreparedDocuments()')
    expect(source).toContain('await tx.insert(document).values')
  })

  it('treats authenticated document parsing as best effort and compensates failed storage writes', () => {
    const source = read('server/api/candidates/[id]/documents/index.post.ts')
    expect(source).toContain("logWarn('document.parse_failed'")
    expect(source).toContain('await deleteFromS3(storageKey)')
    expect(source.indexOf('await uploadToS3(storageKey, fileBuffer, mimeType)')).toBeGreaterThan(source.indexOf('try {'))
  })

  it('validates OIDC network destinations and redirects before trusting discovery endpoints', () => {
    const provider = read('server/api/sso/providers.post.ts')
    const safeDiscovery = read('server/utils/safeOidcDiscovery.ts')
    expect(provider).toContain('prefetchSafeOidcEndpointOrigins')
    expect(safeDiscovery).toContain("import { lookup } from 'node:dns/promises'")
    expect(safeDiscovery).toContain("redirect: 'manual'")
    expect(safeDiscovery).toContain('await assertSafeOidcUrl(current)')
    expect(safeDiscovery).toContain('const validatedEndpoint = await assertSafeOidcUrl(value)')
  })
})
