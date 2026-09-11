import { describe, expect, it } from 'vitest'
import { sanitizeLogAttributes, sanitizeLogString } from '../../server/utils/logger'

describe('production telemetry redaction', () => {
  it('redacts direct identifiers and credentials from free text', () => {
    const input = 'candidate jane.doe@example.com phone +91 98765 43210 Bearer abc.def.ghi? token=secret-value'
    const output = sanitizeLogString(input)

    expect(output).not.toContain('jane.doe@example.com')
    expect(output).not.toContain('98765 43210')
    expect(output).not.toContain('secret-value')
    expect(output).toContain('[REDACTED_EMAIL]')
  })

  it('redacts sensitive attribute keys while preserving operational ids', () => {
    const output = sanitizeLogAttributes({
      org_id: 'org_123',
      candidate_id: 'cand_123',
      candidate_email: 'person@example.com',
      prompt: 'full resume and model prompt',
      access_token: 'secret',
      status_code: 502,
    }) as Record<string, unknown>

    expect(output.org_id).toBe('org_123')
    expect(output.candidate_id).toBe('cand_123')
    expect(output.candidate_email).toBe('[REDACTED]')
    expect(output.prompt).toBe('[REDACTED]')
    expect(output.access_token).toBe('[REDACTED]')
    expect(output.status_code).toBe(502)
  })

  it('does not serialize nested payloads into logs', () => {
    const output = sanitizeLogAttributes({
      metadata: { resume: 'sensitive' },
      list: ['candidate@example.com'],
    }) as Record<string, unknown>

    expect(output.metadata).toBe('[NON_SCALAR_OMITTED]')
    expect(output.list).toBe('[NON_SCALAR_OMITTED]')
  })

  it('truncates oversized upstream messages', () => {
    const output = sanitizeLogString('x'.repeat(1000))
    expect(output.length).toBeLessThan(600)
    expect(output).toContain('[TRUNCATED]')
  })
})
