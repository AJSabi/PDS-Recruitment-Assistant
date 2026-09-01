export interface InferredResumeIdentity {
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  nameConfidence: 'high' | 'medium' | 'low'
  nameSource: 'label' | 'header' | 'filename' | 'unresolved'
}

const NAME_LABEL = /^(?:candidate\s+)?(?:full\s+)?name\s*[:\-–—]\s*(.+)$/iu
const NON_NAME_TERMS = /\b(?:resume|curriculum\s+vitae|cv|profile|summary|objective|experience|education|skills?|competenc(?:y|ies)|contact|email|phone|mobile|address|linkedin|github|portfolio|professional|career|employment|work|history|certifications?|qualifications?|projects?|achievements?|references?|languages?|interests?|designation|role|position|engineer|developer|architect|manager|management|consultant|specialist|analyst|administrator|executive|director|president|officer|lead|head|sales|marketing|finance|human\s+resources|hr|network|security|cloud|data|software|systems?|technology|technologies|infrastructure|operations|support|account|business|customer|service|services|solution|solutions)\b/iu
const FILENAME_NOISE = /\b(?:resume|curriculum|vitae|cv|profile|updated|latest|final|new|copy|document|doc|pdf|docx|job|application|candidate|202\d|v\d+)\b/giu
const HONORIFIC = /^(?:mr|mrs|ms|miss|dr|prof)\.?\s+/iu

function normalizeCandidateName(value: string): string {
  return value
    .replace(HONORIFIC, '')
    .replace(/[|•·]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isPlausibleName(value: string): boolean {
  const candidate = normalizeCandidateName(value)
  if (!candidate || candidate.length < 2 || candidate.length > 80) return false
  if (/@|https?:|www\.|\d/u.test(candidate)) return false
  if (NON_NAME_TERMS.test(candidate)) return false

  const words = candidate.split(/\s+/u).filter(Boolean)
  if (words.length < 1 || words.length > 6) return false

  return words.every((word) => {
    // Unicode letters support Indian and international names. Initials, apostrophes
    // and hyphenated names are accepted, but punctuation-only tokens are not.
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

  return isPlausibleName(cleaned) ? normalizeCandidateName(cleaned) : null
}

function emailLocalName(email: string | null): string | null {
  if (!email) return null
  const local = email.split('@')[0] ?? ''
  const cleaned = local.replace(/[._-]+/g, ' ').replace(/\d+/g, ' ').replace(/\s+/g, ' ').trim()
  return isPlausibleName(cleaned) ? normalizeCandidateName(cleaned) : null
}

function normalizedTokens(value: string): string[] {
  return normalizeCandidateName(value)
    .toLocaleLowerCase()
    .split(/\s+/u)
    .map(token => token.replace(/[^\p{L}\p{M}]/gu, ''))
    .filter(Boolean)
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
 * Infer candidate identity conservatively from parsed resume text.
 *
 * A wrong candidate name is more damaging than an unresolved one. Therefore:
 * 1. Explicit "Name:" labels win when syntactically plausible.
 * 2. Header candidates must look like human names and reject role/title vocabulary.
 * 3. Header candidates are preferred when corroborated by filename/email identity.
 * 4. Filename-only fallback is accepted only when it is itself a clean human name.
 * 5. Otherwise the name remains blank for recruiter review rather than guessing.
 */
export function inferResumeIdentity(resumeText: string, filename: string): InferredResumeIdentity {
  const email = resumeText.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu)?.[0]?.toLowerCase() ?? null
  const phoneCandidate = resumeText.match(/(?:\+?\d[\d\s().-]{8,}\d)/u)?.[0]?.trim() ?? null
  const phone = phoneCandidate && phoneCandidate.replace(/\D/g, '').length >= 10 ? phoneCandidate : null

  const lines = resumeText.split('\n').slice(0, 25).map(line => line.trim()).filter(Boolean)

  for (const line of lines) {
    const match = line.match(NAME_LABEL)
    const labelled = match?.[1] ? normalizeCandidateName(match[1]) : null
    if (labelled && isPlausibleName(labelled)) {
      return { ...splitName(labelled), email, phone, nameConfidence: 'high', nameSource: 'label' }
    }
  }

  const fromFilename = filenameName(filename)
  const fromEmail = emailLocalName(email)
  const headerCandidates = lines
    .filter(line => line.length <= 80 && isPlausibleName(line))
    .map(normalizeCandidateName)

  const corroboratedHeader = headerCandidates.find(name => corroborates(name, fromFilename) || corroborates(name, fromEmail))
  if (corroboratedHeader) {
    return { ...splitName(corroboratedHeader), email, phone, nameConfidence: 'high', nameSource: 'header' }
  }

  // A very early clean header is usually the name, but keep confidence medium
  // unless another source corroborates it. This avoids accepting later section text.
  const earlyHeader = lines.slice(0, 5).find(line => isPlausibleName(line))
  if (earlyHeader) {
    return { ...splitName(earlyHeader), email, phone, nameConfidence: 'medium', nameSource: 'header' }
  }

  if (fromFilename && (corroborates(fromFilename, fromEmail) || !fromEmail)) {
    return { ...splitName(fromFilename), email, phone, nameConfidence: fromEmail ? 'high' : 'medium', nameSource: 'filename' }
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
