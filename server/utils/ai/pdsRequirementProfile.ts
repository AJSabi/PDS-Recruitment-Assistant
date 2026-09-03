import { z } from 'zod'
import { generateStructuredOutput, type ProviderConfig } from './provider'

export const requirementProfileExtractionSchema = z.object({
  jobTitle: z.string().trim().max(200).nullable(),
  functionName: z.string().trim().max(300).nullable(),
  hiringManager: z.string().trim().max(300).nullable(),
  location: z.string().trim().max(500).nullable(),
  experienceRequirement: z.string().trim().max(500).nullable(),
  seniority: z.enum(['junior', 'mid', 'senior', 'lead']).nullable(),
  openings: z.number().int().min(1).max(500).nullable(),
  closureDate: z.string().trim().max(100).nullable(),
  majorRequirements: z.array(z.string().trim().min(1).max(500)).max(20),
})

export type RequirementProfileExtraction = z.infer<typeof requirementProfileExtractionSchema>

export async function extractRequirementProfileFromJd(config: ProviderConfig, jdText: string) {
  const result = await generateStructuredOutput(config, {
    system: `Extract a recruitment Requirement Profile only from the supplied Job Description.

Rules:
- Use only information explicitly stated or clearly implied by the JD.
- Do not invent a Hiring Manager, Closure Date or number of Openings if absent.
- jobTitle: role title.
- functionName: business function/department such as Sales, HR, Finance, Technology, Presales, Operations.
- location: stated work location(s).
- experienceRequirement: preserve the JD's experience requirement in concise human-readable form, e.g. "10-15 years".
- seniority must be one of junior, mid, senior or lead. Infer this only from the role title/experience level; use null if unclear.
- openings: explicit number of positions only; otherwise null.
- closureDate: explicit recruitment closure/target date only; otherwise null.
- majorRequirements: 3-10 concise role-critical requirements from the JD, prioritising responsibilities, domain/technology expertise, ownership, revenue/target scope, customer level and required experience.
- Never extract or infer protected/sensitive personal characteristics.`,
    prompt: `JOB DESCRIPTION:\n${jdText}\n\nExtract the Requirement Profile.`,
    schema: requirementProfileExtractionSchema,
    schemaName: 'PdsRequirementProfileExtraction',
  })
  return result.object
}
