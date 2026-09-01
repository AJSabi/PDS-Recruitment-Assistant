import { describe, expect, it } from 'vitest'
import { inferResumeIdentity, isNameSupportedByResume } from '../../server/utils/resumeIdentity'

describe('resume identity inference', () => {
  it('prefers an explicit full name label', () => {
    const result = inferResumeIdentity(`RESUME\nName: Ajit Sebastian\nCHRO & General Manager\najit.sebastian@example.com\n+91 98765 43210`, 'resume.pdf')
    expect(result.firstName).toBe('Ajit')
    expect(result.lastName).toBe('Sebastian')
    expect(result.nameSource).toBe('label')
    expect(result.nameConfidence).toBe('high')
  })

  it('does not mistake a job title for the candidate name', () => {
    const result = inferResumeIdentity(`CURRICULUM VITAE\nSenior Network Security Engineer\nProfessional Summary\n15 years of infrastructure experience\ncontact@example.com`, 'Resume_Network_Engineer_Final.pdf')
    expect(result.firstName).toBe('')
    expect(result.lastName).toBe('')
    expect(result.nameSource).toBe('unresolved')
  })

  it('accepts a clean header name and rejects the following designation', () => {
    const result = inferResumeIdentity(`Vishal Vijay Sukate\nSenior Account Manager\nvishal.sukate@example.com\nExperience`, 'Vishal_Vijay_Sukate_Resume.pdf')
    expect(result.firstName).toBe('Vishal')
    expect(result.lastName).toBe('Vijay Sukate')
    expect(result.nameSource).toBe('header')
    expect(result.nameConfidence).toBe('high')
  })

  it('supports initials and hyphenated or apostrophe names', () => {
    const result = inferResumeIdentity(`Name: A. K. O'Neill-Singh\na.k.oneill@example.com\nSkills`, 'CV.pdf')
    expect(result.firstName).toBe('A.')
    expect(result.lastName).toBe("K. O'Neill-Singh")
  })

  it('supports a single-name candidate without inventing a surname', () => {
    const result = inferResumeIdentity(`Name: Sindhu\nsindhu@example.com\nEducation`, 'Sindhu_resume.pdf')
    expect(result.firstName).toBe('Sindhu')
    expect(result.lastName).toBe('')
  })

  it('uses a clean filename only when it resembles a human name', () => {
    const result = inferResumeIdentity(`Professional Summary\nExperienced technology professional\ncontact@example.com`, 'Karthik_Rajendran_Resume_2026.pdf')
    expect(result.firstName).toBe('Karthik')
    expect(result.lastName).toBe('Rajendran')
    expect(result.nameSource).toBe('filename')
  })

  it('does not derive a name from role-oriented filenames', () => {
    const result = inferResumeIdentity(`Professional Summary\nExperienced technology professional`, 'Resume_Senior_Account_Manager_Final.pdf')
    expect(result.firstName).toBe('')
    expect(result.lastName).toBe('')
  })

  it('accepts an AI proposed name only when the resume supports it', () => {
    const resume = `Rahul Sharma\nEnterprise Account Executive\nrahul.sharma@example.com\nExperience`
    expect(isNameSupportedByResume('Rahul', 'Sharma', resume)).toBe(true)
  })

  it('rejects an AI hallucinated name even when it looks syntactically valid', () => {
    const resume = `Rahul Sharma\nEnterprise Account Executive\nrahul.sharma@example.com\nExperience`
    expect(isNameSupportedByResume('Amit', 'Verma', resume)).toBe(false)
  })

  it('rejects a designation supplied by AI as a name', () => {
    const resume = `Senior Network Security Engineer\nProfessional Summary\ncontact@example.com`
    expect(isNameSupportedByResume('Senior Network', 'Security Engineer', resume)).toBe(false)
  })
})
