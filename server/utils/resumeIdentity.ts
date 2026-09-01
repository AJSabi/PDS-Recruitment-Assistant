export interface InferredResumeIdentity {
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  nameConfidence: 'high' | 'medium' | 'low'
  nameSource: 'label' | 'header' | 'filename' | 'unresolved'
}

const NAME_LABEL = /^(?:candidate\s+)?(?:full\s+)?name\s*[:\-–—]\s*(.+)$/iu
const NON_NAME_TERMS = /\b(?:resume|curriculum\s+vitae|cv|profile|summary|objective|experience|education|skills?|competenc(?:y|ies)|contact|email|phone|mobile|address|linkedin|github|portfolio|professional|career|employment|work|history|certifications?|qualifications?|projects?|achievements?|references?|languages?|interests?|designation|role|position|engineer|developer|architect|manager|management|consultant|specialist|analyst|administrator|executive|director|president|officer|lead|head|sales|marketing|finance|human\s+resources|hr|network|security|cloud|data|software|systems?|technology|technologies|infrastructure|operations|support|account|business|customer|service|services|solution|solutions|graduate|graduation|bachelor|master|btech|b\.tech|mtech|m\.tech|mba|bba|bca|mca|university|college|institute|school|india|delhi|new\s+delhi|noida|gurgaon|gurugram|mumbai|bombay|pune|bengaluru|bangalore|hyderabad|chennai|kolkata|calcutta|kerala|karnataka|maharashtra|location)\b/iu
const FILENAME_NOISE = /\b(?:resume|curriculum|vitae|cv|profile|updated|latest|final|new|copy|document|doc|pdf|docx|job|application|candidate|202\d|v\d+)\b/giu
const HONORIFIC = /^(?:mr|mrs|ms|miss|dr|prof)\.?\s+/iu
const HEADER_SEGMENT_SEPARATOR = /[|•·]+/u

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

/**
 * Extract only self-contained header segments that could reasonably carry a name.
 * Contact/designation text on the same visual line is separated on common resume
 * delimiters before plausibility checks.
 */
function headerNameCandidates(resumeText: string, lineLimit = 25): string[] {
  const candidates: string[] = []
  const lines = resumeText.split('\n').slice(0, lineLimit).map(line => line.trim()).filter(Boolean)

  for (const line of lines) {
    const labelled = line.match(NAME_LABEL)?.[1]
    if (labelled) {
      const normalized = normalizeCandidateName(labelled)
      if (isPlausibleResumeName(normalized)) candidates.push(normalized)
      continue
    }

    for (const segment of line.split(HEADER_SEGMENT_SEPARATOR)) {
      const normalized = normalizeCandidateName(segment)
      if (normalized.length <= 80 && isPlausibleResumeName(normalized)) candidates.push(normalized)
    }
  }

  return [...new Set(candidates)]
}

/**
 * Verify that an AI-proposed name is plausible and represented as one coherent
 * name-bearing segment in the resume header. Merely finding the individual name
 * tokens on unrelated header lines is not sufficient.
 */
export function isNameSupportedByResume(firstName: string, lastName: string, resumeText: string): boolean {
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim()
  if (!isPlausibleResumeName(fullName)) return false

  return headerNameCandidates(resumeText, 30).some(candidate => sameName(candidate, fullName))
}

/**
 * Infer candidate identity conservatively from parsed resume text.
 * A wrong candidate name is more damaging than an unresolved one.
 */
export function inferResumeIdentity(resumeText: string, filename: string): InferredResumeIdentity {
  const email = resumeText.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu)?.[0]?.toLowerCase() ?? null
  const phoneCandidate = resumeText.match(/(?:\+?\d[\d\s().-]{8,}\d)/u)?.[0]?.trim() ?? null
  const phone = phoneCandidate && phoneCandidate.replace(/\D/g, '').length >= 10 ? phoneCandidate : null

  const lines = resumeText.split('\n').slice(0, 25).map(line => line.trim()).filter(Boolean)

  for (const line of lines) {
    const match = line.match(NAME_LABEL)
    const labelled = match?.[1] ? normalizeCandidateName(match[1]) : null
    if (labelled && isPlausibleResumeName(labelled)) {
      return { ...splitName(labelled), email, phone, nameConfidence: 'high', nameSource: 'label' }
    }
  }

  const fromFilename = filenameName(filename)
  const fromEmail = emailLocalName(email)
  const headerCandidates = headerNameCandidates(resumeText)

  const corroboratedHeader = headerCandidates.find(name => corroborates(name, fromFilename) || corroborates(name, fromEmail))
  if (corroboratedHeader) {
    return { ...splitName(corroboratedHeader), email, phone, nameConfidence: 'high', nameSource: 'header' }
  }

  // Do not fall back to the first superficially name-like header line. Locations,
  // employers, qualifications and other short resume headers frequently satisfy
  // syntactic name rules. Without corroboration, unresolved is safer than wrong.
  if (fromFilename) {
    const filenameAppearsInHeader = headerCandidates.some(name => sameName(name, fromFilename))
    if (filenameAppearsInHeader || corroborates(fromFilename, fromEmail)) {
      return {
        ...splitName(fromFilename),
        email,
        phone,
        nameConfidence: filenameAppearsInHeader && fromEmail ? 'high' : 'medium',
        nameSource: 'filename',
      }
    }

    // A clean human-name filename remains a controlled fallback when the parsed
    // header has no competing plausible identity at all (common for scanned/layout-heavy CVs).
    if (headerCandidates.length === 0 && !fromEmail) {
      return { ...splitName(fromFilename), email, phone, nameConfidence: 'medium', nameSource: 'filename' }
    }
  }

  return {
    firstName: '',
    lastName: '',
    email,
    phone,
    nameConfidence: 'low',
    nameSource: 'unresolved',
  }
}
