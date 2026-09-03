import { z } from 'zod'
import { generateStructuredOutput, type ProviderConfig } from './provider'

const candidateIdentitySchema = z.object({
  firstName: z.string().trim().max(100),
  lastName: z.string().trim().max(100),
  email: z.string().trim().email().max(320).nullable(),
  phone: z.string().trim().max(50).nullable(),
})

export type CandidateIdentity = z.infer<typeof candidateIdentitySchema>

export async function extractCandidateIdentity(config: ProviderConfig, resumeText: string) {
  const result = await generateStructuredOutput(config, {
    system: `Extract only basic candidate identity/contact fields from resume text for recruitment database matching.
Rules:
- Return firstName, lastName, email and phone only.
- Use only information explicitly present in the resume; never infer a name from a job title, designation, employer, section heading or skill.
- Preserve the candidate's actual name order as written. Indian and international naming conventions, initials, compound surnames, apostrophes and hyphenated names are valid.
- If the candidate name is not clearly and explicitly identifiable, return firstName and lastName as empty strings. Do not guess.
- A single-name candidate is valid: put the explicit name in firstName and return lastName as an empty string.
- If several emails or phone numbers are present, choose the candidate's primary personal contact when clearly identifiable.
- Do not infer gender, age, ethnicity, religion, marital status or any other protected/sensitive characteristic.
- Return email as null when no valid email is explicitly present.
- Return phone as null when no phone number is explicitly present.`,
    prompt: `RESUME TEXT:\n${resumeText}\n\nExtract the candidate identity conservatively. An unresolved name is preferable to an invented one.`,
    schema: candidateIdentitySchema,
    schemaName: 'PdsCandidateIdentity',
  })
  return result.object
}
