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
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu
const URL_PATTERN = /(?:https?:\/\/|www\.)\S+/giu
const LINKEDIN_PATTERN = /\b(?:linkedin(?:\.com)?\/in\/)?[A-Za-z0-9._-]+(?=\s*$)/iu
const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{8,}\d)/gu

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
 * Remove contact artifacts that PDF/DOCX text extraction often places on the same
 * visual line as the candidate's name. We only remove strongly structured contact
 * forms; arbitrary prose is never stripped into a name candidate.
 */
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

function addCandidate(target: string[], value: string) {
  const normalized = normalizeCandidateName(stripContactNoise(value))
  if (normalized.length <= 80 && isPlausibleResumeName(normalized)) target.push(normalized)
}

/**
 * Extract self-contained header segments that could reasonably carry a name.
 * The extended window supports two-column/layout-heavy resumes whose PDF text order
 * emits contact/sidebar content before the visual name. Candidates beyond the early
 * header are used only with filename/email corroboration by inferResumeIdentity.
 */
function headerNameCandidates(resumeText: string, lineLimit = 40): { name: string, lineIndex: number }[] {
  const candidates: Array<{ name: string, lineIndex: number }> = []
  const lines = resumeText.split('\n').slice(0, lineLimit).map(line => line.trim())

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]
    if (!line) continue

    const labelled = line.match(NAME_LABEL)?.[1]
    if (labelled) {
      const names: string[] = []
      addCandidate(names, labelled)
      for (const name of names) candidates.push({ name, lineIndex })
      continue
    }

    for (const segment of line.split(HEADER_SEGMENT_SEPARATOR)) {
      const names: string[] = []
      addCandidate(names, segment)
      for (const name of names) candidates.push({ name, lineIndex })
    }
  }

  const deduped = new Map<string, { name: string, lineIndex: number }>()
  for (const candidate of candidates) {
    const key = normalizedTokens(candidate.name).join(' ')
    if (key && !deduped.has(key)) deduped.set(key, candidate)
  }
  return [...deduped.values()]
}

/**
 * Verify that an AI-proposed name is plausible and represented as one coherent
 * name-bearing segment in the resume header. Merely finding individual name tokens
 * on unrelated lines is insufficient. A wider layout window is allowed only when
 * the complete proposed name appears on one coherent line/segment.
 */
export function isNameSupportedByResume(firstName: string, lastName: string, resumeText: string): boolean {
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim()
  if (!isPlausibleResumeName(fullName)) return false

  return headerNameCandidates(resumeText, 40).some(candidate => sameName(candidate.name, fullName))
}

/**
 * Infer candidate identity conservatively from parsed resume text.
 * A wrong candidate name is more damaging than an unresolved one.
 */
export function inferResumeIdentity(resumeText: string, filename: string): InferredResumeIdentity {
  const email = resumeText.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu)?.[0]?.toLowerCase() ?? null
  const phoneCandidate = resumeText.match(/(?:\+?\d[\d\s().-]{8,}\d)/u)?.[0]?.trim() ?? null
  const phone = phoneCandidate && phoneCandidate.replace(/\D/g, '').length >= 10 ? phoneCandidate : null

  const lines = resumeText.split('\n').slice(0, 40).map(line => line.trim()).filter(Boolean)

  for (const line of lines.slice(0, 25)) {
    const match = line.match(NAME_LABEL)
    const labelled = match?.[1] ? normalizeCandidateName(stripContactNoise(match[1])) : null
    if (labelled && isPlausibleResumeName(labelled)) {
      return { ...splitName(labelled), email, phone, nameConfidence: 'high', nameSource: 'label' }
    }
  }

  const fromFilename = filenameName(filename)
  const fromEmail = emailLocalName(email)
  const headerCandidates = headerNameCandidates(resumeText, 40)

  const corroboratedHeader = headerCandidates.find(({ name }) => corroborates(name, fromFilename) || corroborates(name, fromEmail))
  if (corroboratedHeader) {
    return { ...splitName(corroboratedHeader.name), email, phone, nameConfidence: 'high', nameSource: 'header' }
  }

  // Only the early visual/header area may establish a name without external
  // corroboration, and even there it must be a clean coherent name segment.
  const uncorroboratedEarly = headerCandidates.filter(candidate => candidate.lineIndex < 8)
  if (uncorroboratedEarly.length === 1 && !fromFilename && !fromEmail) {
    return { ...splitName(uncorroboratedEarly[0].name), email, phone, nameConfidence: 'medium', nameSource: 'header' }
  }

  if (fromFilename) {
    const filenameAppearsInHeader = headerCandidates.some(({ name }) => sameName(name, fromFilename))
    if (filenameAppearsInHeader || corroborates(fromFilename, fromEmail)) {
      return {
        ...splitName(fromFilename),
        email,
        phone,
        nameConfidence: filenameAppearsInHeader && fromEmail ? 'high' : 'medium',
        nameSource: 'filename',
      }
    }

    // A clean human-name filename remains a controlled fallback when extraction
    // produced no competing plausible identity at all.
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
