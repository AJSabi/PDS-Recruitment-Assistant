import { describe, expect, it } from 'vitest'
import { inferResumeIdentity } from '../../server/utils/resumeIdentity'

describe('PDS resume identity confidence', () => {
  it('marks explicitly labelled contact identity as high confidence', () => {
    const result = inferResumeIdentity(
      `Name: Ajit Sebastian\nEmail: ajit.sebastian@example.com\nMobile: +91 98765 43210\nExperience`,
      'Ajit_Sebastian_Resume.pdf',
    )

    expect(result.nameConfidence).toBe('high')
    expect(result.emailConfidence).toBe('high')
    expect(result.emailSource).toBe('resume_text')
    expect(result.phoneConfidence).toBe('high')
    expect(result.phoneSource).toBe('label')
    expect(result.reviewRequired).toBe(false)
    expect(result.reviewReasons).toEqual([])
  })

  it('keeps an unlabelled phone as review-required instead of overstating confidence', () => {
    const result = inferResumeIdentity(
      `Name: Rahul Sharma\nrahul.sharma@example.com\n+91 98765 43210\nExperience`,
      'Rahul_Sharma_Resume.pdf',
    )

    expect(result.phone).toBe('+91 98765 43210')
    expect(result.phoneConfidence).toBe('medium')
    expect(result.phoneSource).toBe('resume_text')
    expect(result.reviewRequired).toBe(true)
    expect(result.reviewReasons).toContain('Phone was detected without an explicit phone/mobile label and should be verified.')
  })

  it('marks missing email as unresolved and requires manual entry', () => {
    const result = inferResumeIdentity(
      `Name: Devika Menon\nMobile: +91 91234 56789\nProfessional Experience`,
      'Devika_Menon_Resume.pdf',
    )

    expect(result.email).toBeNull()
    expect(result.emailConfidence).toBe('low')
    expect(result.emailSource).toBe('unresolved')
    expect(result.reviewRequired).toBe(true)
    expect(result.reviewReasons).toContain('Email was not detected in the resume and must be entered manually.')
  })

  it('flags fallback filename identity for recruiter verification', () => {
    const result = inferResumeIdentity(
      `Professional Summary\nExperienced technology professional`,
      'Karthik_Rajendran_Resume_2026.pdf',
    )

    expect(result.firstName).toBe('Karthik')
    expect(result.lastName).toBe('Rajendran')
    expect(result.nameConfidence).toBe('medium')
    expect(result.nameSource).toBe('filename')
    expect(result.reviewRequired).toBe(true)
    expect(result.reviewReasons).toContain('Candidate name was inferred from a fallback source and should be verified.')
  })

  it('does not make an optional absent phone a review blocker by itself', () => {
    const result = inferResumeIdentity(
      `Name: Sindhu\nsindhu@example.com\nEducation`,
      'Sindhu_Resume.pdf',
    )

    expect(result.phone).toBeNull()
    expect(result.phoneConfidence).toBe('low')
    expect(result.phoneSource).toBe('unresolved')
    expect(result.reviewRequired).toBe(false)
  })
})
