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

  it('does not mistake a location for a candidate name', () => {
    const result = inferResumeIdentity(`New Delhi India\nEnterprise Sales\ncontact@example.com\nProfessional Summary`, 'resume_final.pdf')
    expect(result.firstName).toBe('')
    expect(result.lastName).toBe('')
    expect(result.nameSource).toBe('unresolved')
  })

  it('does not accept an uncorroborated name-like header line', () => {
    const result = inferResumeIdentity(`Global Solutions Private Limited\nProfessional Summary\ncontact@example.com\nExperience`, 'resume.pdf')
    expect(result.firstName).toBe('')
    expect(result.lastName).toBe('')
  })

  it('accepts an AI proposed name only when the resume supports it', () => {
    const resume = `Rahul Sharma\nEnterprise Account Executive\nrahul.sharma@example.com\nExperience`
    expect(isNameSupportedByResume('Rahul', 'Sharma', resume)).toBe(true)
  })

  it('supports a name segment sharing a visual line with contact details', () => {
    const resume = `Rahul Sharma | +91 98765 43210 | rahul.sharma@example.com\nEnterprise Account Executive\nExperience`
    expect(isNameSupportedByResume('Rahul', 'Sharma', resume)).toBe(true)
  })

  it('supports extracted name plus phone and email without visual separators', () => {
    const resume = `Rahul Sharma +91 98765 43210 rahul.sharma@example.com\nEnterprise Account Executive\nExperience`
    expect(isNameSupportedByResume('Rahul', 'Sharma', resume)).toBe(true)
    const result = inferResumeIdentity(resume, 'resume.pdf')
    expect(result.firstName).toBe('Rahul')
    expect(result.lastName).toBe('Sharma')
    expect(result.nameSource).toBe('header')
  })

  it('finds a corroborated name later in a layout-heavy extracted header', () => {
    const resume = `+91 98765 43210\nrahul.sharma@example.com\nLinkedIn\nNew Delhi\nPortfolio\nCore Skills\nCisco\nCloud\nRahul Sharma\nEnterprise Account Executive\nExperience`
    const result = inferResumeIdentity(resume, 'Rahul_Sharma_Resume.pdf')
    expect(result.firstName).toBe('Rahul')
    expect(result.lastName).toBe('Sharma')
    expect(result.nameSource).toBe('header')
    expect(result.nameConfidence).toBe('high')
  })

  it('does not trust a later name-like line without filename or email corroboration', () => {
    const resume = `+91 98765 43210\ncontact@example.com\nLinkedIn\nNew Delhi\nPortfolio\nCore Skills\nCisco\nCloud\nRahul Sharma\nEnterprise Account Executive\nExperience`
    const result = inferResumeIdentity(resume, 'resume.pdf')
    expect(result.firstName).toBe('')
    expect(result.lastName).toBe('')
  })

  it('rejects an AI hallucinated name even when it looks syntactically valid', () => {
    const resume = `Rahul Sharma\nEnterprise Account Executive\nrahul.sharma@example.com\nExperience`
    expect(isNameSupportedByResume('Amit', 'Verma', resume)).toBe(false)
  })

  it('rejects AI names assembled from tokens on separate header lines', () => {
    const resume = `Rahul Verma\nSharma Consulting\nrahul.verma@example.com\nExperience`
    expect(isNameSupportedByResume('Rahul', 'Sharma', resume)).toBe(false)
  })

  it('rejects a designation supplied by AI as a name', () => {
    const resume = `Senior Network Security Engineer\nProfessional Summary\ncontact@example.com`
    expect(isNameSupportedByResume('Senior Network', 'Security Engineer', resume)).toBe(false)
  })

  describe('Indian resume regression corpus', () => {
    it('finds an uppercase candidate name after common Indian CV headings and city sidebar text', () => {
      const resume = `CURRICULUM VITAE\nPERSONAL DETAILS\nAHMEDABAD\nMEERA NAIR\nSenior Sales Consultant\nmeera.nair@example.com\n+91 91234 56789\nPROFESSIONAL EXPERIENCE`
      const result = inferResumeIdentity(resume, 'Resume_Final.pdf')
      expect(result.firstName).toBe('MEERA')
      expect(result.lastName).toBe('NAIR')
      expect(result.nameSource).toBe('header')
      expect(result.nameConfidence).toBe('high')
    })

    it('accepts an explicit full-name field despite declaration and academic headings', () => {
      const resume = `DECLARATION\nACADEMIC QUALIFICATIONS\nFull Name: Devika Menon\nChandigarh\ndevika.menon@example.com\nKey Skills`
      const result = inferResumeIdentity(resume, 'CV_Final.docx')
      expect(result.firstName).toBe('Devika')
      expect(result.lastName).toBe('Menon')
      expect(result.nameSource).toBe('label')
      expect(result.nameConfidence).toBe('high')
    })

    it('preserves Indian-style initials while suppressing personal-detail labels', () => {
      const resume = `PERSONAL INFORMATION\nCandidate Name: R. K. Iyer\nNationality: Indian\nIndore\nr.k.iyer@example.com\nWork Experience`
      const result = inferResumeIdentity(resume, 'Resume.pdf')
      expect(result.firstName).toBe('R.')
      expect(result.lastName).toBe('K. Iyer')
      expect(result.nameSource).toBe('label')
    })

    it('keeps a genuine single-name candidate when nearby administrative labels are suppressed', () => {
      const resume = `PERSONAL DETAILS\nName: Devika\nMarital Status\nKochi\ndevika@example.com\nEducation`
      const result = inferResumeIdentity(resume, 'CV_Final.docx')
      expect(result.firstName).toBe('Devika')
      expect(result.lastName).toBe('')
      expect(result.nameSource).toBe('label')
    })

    it.each([
      ['Declaration', 'Resume.pdf'],
      ['Academic Qualifications', 'CV_Final.docx'],
      ['Ahmedabad', 'Resume_Final.pdf'],
      ['Chandigarh', 'CV.pdf'],
      ['Marital Status', 'Resume.pdf'],
      ['Nationality', 'CV_Final.docx'],
    ])('leaves heading or location-only identity unresolved: %s', (header, filename) => {
      const result = inferResumeIdentity(`${header}\nProfessional Summary\ncontact@example.com\nExperience`, filename)
      expect(result.firstName).toBe('')
      expect(result.lastName).toBe('')
      expect(result.nameSource).toBe('unresolved')
      expect(result.nameConfidence).toBe('low')
    })

    it('does not use generic resume filenames as candidate identity', () => {
      for (const filename of ['Resume.pdf', 'CV_Final.docx', 'Resume_Final.pdf']) {
        const result = inferResumeIdentity(`Personal Details\nProfessional Summary\ncontact@example.com`, filename)
        expect(result.firstName).toBe('')
        expect(result.lastName).toBe('')
        expect(result.nameSource).toBe('unresolved')
      }
    })
  })
})
