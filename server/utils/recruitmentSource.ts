export const RECRUITMENT_SOURCE_VALUES = [
  'recruiter_sourcing',
  'employee_referral',
  'linkedin',
  'naukri',
  'career_site',
  'existing_database',
  'agency',
  'other',
] as const

export type RecruitmentSource = typeof RECRUITMENT_SOURCE_VALUES[number]

export const RECRUITMENT_SOURCE_LABELS: Record<RecruitmentSource, string> = {
  recruiter_sourcing: 'Recruiter Sourcing',
  employee_referral: 'Employee Referral',
  linkedin: 'LinkedIn',
  naukri: 'Naukri',
  career_site: 'Career Site',
  existing_database: 'Existing Database',
  agency: 'Agency',
  other: 'Other',
}

export function applicationSourcePersistence(source: RecruitmentSource) {
  switch (source) {
    case 'employee_referral': return { channel: 'referral' as const, utmSource: 'employee_referral' }
    case 'linkedin': return { channel: 'linkedin' as const, utmSource: 'linkedin' }
    case 'naukri': return { channel: 'custom' as const, utmSource: 'naukri' }
    case 'career_site': return { channel: 'career_site' as const, utmSource: 'career_site' }
    case 'existing_database': return { channel: 'custom' as const, utmSource: 'existing_database' }
    case 'agency': return { channel: 'agency' as const, utmSource: 'agency' }
    case 'other': return { channel: 'other' as const, utmSource: 'other' }
    case 'recruiter_sourcing':
    default:
      return { channel: 'direct' as const, utmSource: 'recruiter_sourcing' }
  }
}

export function recruitmentSourceFromPersistence(channel?: string | null, utmSource?: string | null): RecruitmentSource | 'unattributed' {
  if (utmSource && RECRUITMENT_SOURCE_VALUES.includes(utmSource as RecruitmentSource)) return utmSource as RecruitmentSource
  if (channel === 'referral') return 'employee_referral'
  if (channel === 'linkedin') return 'linkedin'
  if (channel === 'career_site') return 'career_site'
  if (channel === 'agency') return 'agency'
  if (channel === 'direct') return 'recruiter_sourcing'
  if (channel === 'other') return 'other'
  return 'unattributed'
}

export function recruitmentSourceLabel(source: RecruitmentSource | 'unattributed') {
  return source === 'unattributed' ? 'Unattributed' : RECRUITMENT_SOURCE_LABELS[source]
}
