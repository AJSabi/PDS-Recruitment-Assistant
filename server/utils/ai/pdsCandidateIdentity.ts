import { z } from 'zod'
import { generateStructuredOutput, type ProviderConfig } from './provider'

const candidateIdentitySchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().max(50).nullable(),
})

export async function extractCandidateIdentity(config: ProviderConfig, resumeText: string) {
  const result = await generateStructuredOutput(config, {
    system: `Extract only basic candidate identity/contact fields from resume text for recruitment database matching.
Rules:
- Return firstName, lastName, email and phone only.
- Use only information explicitly present in the resume.
- Do not infer gender, age, ethnicity, religion, marital status or any other protected/sensitive characteristic.
- If several emails or phone numbers are present, choose the candidate's primary personal contact when clearly identifiable.
- Do not invent missing information. An email is required for reliable candidate deduplication.`,
    prompt: `RESUME TEXT:\n${resumeText}\n\nExtract the candidate identity.`,
    schema: candidateIdentitySchema,
    schemaName: 'PdsCandidateIdentity',
  })
  return result.object
}
