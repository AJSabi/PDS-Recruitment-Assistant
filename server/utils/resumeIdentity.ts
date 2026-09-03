export type IdentityConfidence = 'high' | 'medium' | 'low'

export interface InferredResumeIdentity {
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  nameConfidence: IdentityConfidence
  nameSource: 'label' | 'header' | 'filename' | 'unresolved'
  emailConfidence: IdentityConfidence
  emailSource: 'resume_text' | 'unresolved'
  phoneConfidence: IdentityConfidence
  phoneSource: 'label' | 'resume_text' | 'unresolved'
  reviewRequired: boolean
  reviewReasons: string[]
}

const NAME_LABEL = /^(?:candidate\s+)?(?:full\s+)?name\s*[:\-–—]\s*(.+)$/iu
const NON_NAME_TERMS = /\b(?:resume|curriculum\s+vitae|cv|profile|summary|objective|experience|education|skills?|competenc(?:y|ies)|contact|email|phone|mobile|address|linkedin|github|portfolio|professional|career|employment|work|history|certifications?|qualifications?|projects?|achievements?|references?|languages?|interests?|designation|role|position|engineer|developer|architect|manager|management|consultant|specialist|analyst|administrator|executive|director|president|officer|lead|head|sales|marketing|finance|human\s+resources|hr|network|security|cloud|data|software|systems?|technology|technologies|infrastructure|operations|support|account|business|customer|service|services|solution|solutions|graduate|graduation|bachelor|master|btech|b\.tech|mtech|m\.tech|mba|bba|bca|mca|university|college|institute|school|declaration|personal\s+(?:details|information)|academic\s+(?:details|qualifications)|educational\s+(?:details|qualifications)|technical\s+skills?|core\s+(?:skills|competencies)|key\s+skills?|about\s+me|career\s+profile|professional\s+experience|work\s+experience|employment\s+history|work\s+history|date\s+of\s+birth|dob|nationality|marital\s+status|gender|father(?:'s)?\s+name|mother(?:'s)?\s+name|india|indian|delhi|new\s+delhi|noida|gurgaon|gurugram|mumbai|bombay|pune|bengaluru|bangalore|hyderabad|chennai|kolkata|calcutta|ahmedabad|chandigarh|indore|jaipur|lucknow|ghaziabad|faridabad|kochi|cochin|ernakulam|thiruvananthapuram|trivandrum|bhopal|patna|nagpur|surat|vadodara|baroda|kerala|karnataka|maharashtra|telangana|tamil\s+nadu|uttar\s+pradesh|haryana|gujarat|rajasthan|west\s+bengal|location)\b/iu
const FILENAME_NOISE = /\b(?:resume|curriculum|vitae|cv|profile|updated|latest|final|new|copy|document|doc|pdf|docx|job|application|candidate|202\d|v\d+)\b/giu
const HONORIFIC = /^(?:mr|mrs|ms|miss|dr|prof)\.?\s+/iu
const HEADER_SEGMENT_SEPARATOR = /[|•·]+/u
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu
const URL_PATTERN = /(?:https?:\/\/|www\.)\S+/giu
const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{8,}\d)/gu
const PHONE_LABEL_PATTERN = /\b(?:mobile|phone|tel|telephone|contact)\s*[:\-]?\s*(\+?\d[\d\s().-]{8,}\d)/iu

function normalizeCandidateName(value: string): string {
  return value
    .replace(HONORIFIC, '')
    .replace(/[|•·]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isPlausibleResumeName(value: string): boolean {
  const candidate = normalizeCandidateName(value)
  if (!candidate || candidate.length < 2 || candidate.length > 80) return false
  if (/@|https?:|www\.|\d/u.test(candidate)) return false
  if (NON_NAME_TERMS.test(candidate)) return false

  const words = candidate.split(/\s+/u).filter(Boolean)
  if (words.length < 1 || words.length > 6) return false

  return words.every((word) => {
    return /^(?:\p{L}[\p{L}\p{M}'’.-]*|\p{L}\.)$/u.test(word)
      && /\p{L}/u.test(word)
  })
}

function splitName(value: string) {
  const parts = normalizeCandidateName(value).split(/\s+/u).filter(Boolean)
  return {
    firstName: parts[0]?.slice(0, 100) ?? '',
    lastName: parts.slice(1).join(' ').slice(0, 100),
  }
}

function filenameName(filename: string): string | null {
  const cleaned = filename
    .replace(/\.(?:pdf|docx?|rtf)$/iu, '')
    .replace(/[_-]+/g, ' ')
    .replace(/[()\[\]]/g, ' ')
    .replace(FILENAME_NOISE, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return isPlausibleResumeName(cleaned) ? normalizeCandidateName(cleaned) : null
}

function emailLocalName(email: string | null): string | null {
  if (!email) return null
  const local = email.split('@')[0] ?? ''
  const cleaned = local.replace(/[._-]+/g, ' ').replace(/\d+/g, ' ').replace(/\s+/g, ' ').trim()
  return isPlausibleResumeName(cleaned) ? normalizeCandidateName(cleaned) : null
}

function normalizedTokens(value: string): string[] {
  return normalizeCandidateName(value)
    .toLocaleLowerCase()
    .split(/\s+/u)
    .map(token => token.replace(/[^\p{L}\p{M}]/gu, ''))
    .filter(Boolean)
}

function sameName(a: string, b: string): boolean {
  const left = normalizedTokens(a)
  const right = normalizedTokens(b)
  return left.length === right.length && left.every((token, index) => token === right[index])
}

function corroborates(candidate: string, other: string | null): boolean {
  if (!other) return false
  const a = normalizedTokens(candidate)
  const b = normalizedTokens(other)
  if (!a.length || !b.length) return false
  const overlap = a.filter(token => b.includes(token)).length
  return overlap >= Math.min(2, a.length, b.length)
}

function stripContactNoise(value: string): string {
  return value
    .replace(EMAIL_PATTERN, ' ')
    .replace(URL_PATTERN, ' ')
    .replace(PHONE_PATTERN, ' ')
    .replace(/\b(?:email|e-mail|mobile|phone|tel|telephone|contact)\s*[:\-]?\s*/giu, ' ')
    .replace(/[,:;]+$/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function candidateFromSegment(value: string): string | null {
  const normalized = normalizeCandidateName(stripContactNoise(value))
  return normalized.length <= 80 && isPlausibleResumeName(normalized) ? normalized : null
}

function headerNameCandidates(resumeText: string, lineLimit = 40): { name: string, lineIndex: number }[] {
  const candidates: Array<{ name: string, lineIndex: number }> = []
  const lines = resumeText.split('\n').slice(0, lineLimit).map(line => line.trim())

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]
    if (!line) continue

    const labelled = line.match(NAME_LABEL)?.[1]
    if (labelled) {
      const name = candidateFromSegment(labelled)
      if (name) candidates.push({ name, lineIndex })
      continue
    }

    for (const segment of line.split(HEADER_SEGMENT_SEPARATOR)) {
      const name = candidateFromSegment(segment)
      if (name) candidates.push({ name, lineIndex })
    }
  }

  const deduped = new Map<string, { name: string, lineIndex: number }>()
  for (const candidate of candidates) {
    const key = normalizedTokens(candidate.name).join(' ')
    if (key && !deduped.has(key)) deduped.set(key, candidate)
  }
  return [...deduped.values()]
}

export function isNameSupportedByResume(firstName: string, lastName: string, resumeText: string): boolean {
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim()
  if (!isPlausibleResumeName(fullName)) return false

  return headerNameCandidates(resumeText, 40).some(candidate => sameName(candidate.name, fullName))
}

function buildIdentity(
  name: { firstName: string; lastName: string; confidence: IdentityConfidence; source: InferredResumeIdentity['nameSource'] },
  resumeText: string,
): InferredResumeIdentity {
  const email = resumeText.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu)?.[0]?.toLowerCase() ?? null
  const labelledPhone = resumeText.match(PHONE_LABEL_PATTERN)?.[1]?.trim() ?? null
  const phoneCandidate = labelledPhone ?? resumeText.match(/(?:\+?\d[\d\s().-]{8,}\d)/u)?.[0]?.trim() ?? null
  const phone = phoneCandidate && phoneCandidate.replace(/\D/g, '').length >= 10 ? phoneCandidate : null
  const phoneConfidence: IdentityConfidence = phone ? (labelledPhone ? 'high' : 'medium') : 'low'
  const reviewReasons: string[] = []

  if (name.confidence !== 'high') reviewReasons.push(name.source === 'unresolved' ? 'Candidate name was not reliably resolved from the resume.' : 'Candidate name was inferred from a fallback source and should be verified.')
  if (!email) reviewReasons.push('Email was not detected in the resume and must be entered manually.')
  if (phone && phoneConfidence !== 'high') reviewReasons.push('Phone was detected without an explicit phone/mobile label and should be verified.')

  return {
    firstName: name.firstName,
    lastName: name.lastName,
    email,
    phone,
    nameConfidence: name.confidence,
    nameSource: name.source,
    emailConfidence: email ? 'high' : 'low',
    emailSource: email ? 'resume_text' : 'unresolved',
    phoneConfidence,
    phoneSource: phone ? (labelledPhone ? 'label' : 'resume_text') : 'unresolved',
    reviewRequired: reviewReasons.length > 0,
    reviewReasons,
  }
}

/**
 * Infer candidate identity conservatively from parsed resume text.
 * A wrong candidate name is more damaging than an unresolved one.
 */
export function inferResumeIdentity(resumeText: string, filename: string): InferredResumeIdentity {
  const lines = resumeText.split('\n').slice(0, 25).map(line => line.trim()).filter(Boolean)

  for (const line of lines) {
    const match = line.match(NAME_LABEL)
    const labelled = match?.[1] ? candidateFromSegment(match[1]) : null
    if (labelled) {
      const split = splitName(labelled)
      return buildIdentity({ ...split, confidence: 'high', source: 'label' }, resumeText)
    }
  }

  const email = resumeText.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu)?.[0]?.toLowerCase() ?? null
  const fromFilename = filenameName(filename)
  const fromEmail = emailLocalName(email)
  const headerCandidates = headerNameCandidates(resumeText, 40)

  const corroboratedHeader = headerCandidates.find(({ name }) => corroborates(name, fromFilename) || corroborates(name, fromEmail))
  if (corroboratedHeader) {
    const split = splitName(corroboratedHeader.name)
    return buildIdentity({ ...split, confidence: 'high', source: 'header' }, resumeText)
  }

  if (fromFilename) {
    const filenameAppearsInHeader = headerCandidates.some(({ name }) => sameName(name, fromFilename))
    if (filenameAppearsInHeader || corroborates(fromFilename, fromEmail)) {
      const split = splitName(fromFilename)
      return buildIdentity({
        ...split,
        confidence: filenameAppearsInHeader && fromEmail ? 'high' : 'medium',
        source: 'filename',
      }, resumeText)
    }

    if (headerCandidates.length === 0 && !fromEmail) {
      const split = splitName(fromFilename)
      return buildIdentity({ ...split, confidence: 'medium', source: 'filename' }, resumeText)
    }
  }

  return buildIdentity({ firstName: '', lastName: '', confidence: 'low', source: 'unresolved' }, resumeText)
}
