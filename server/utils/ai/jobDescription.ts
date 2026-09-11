import { z } from 'zod'
import { generateStructuredOutput, type ProviderConfig } from './provider'

const jdSchema = z.object({
  description: z.string().min(200).max(12000),
})

export async function generateJobDescription(
  config: ProviderConfig,
  input: {
    title: string
    location?: string | null
    type?: string | null
    experienceLevel?: string | null
    currentDescription?: string | null
  },
): Promise<string> {
  const improving = Boolean(input.currentDescription?.trim())
  const result = await generateStructuredOutput(config, {
    system: `You are an expert recruitment content specialist. Create a clear, practical, job-related Job Description for recruiter use.
Rules:
- Use only role-relevant requirements; never infer protected or sensitive attributes.
- Keep requirements realistic and avoid unnecessary credential inflation.
- Structure with concise headings: Role Summary, Key Responsibilities, Required Experience & Skills, Preferred/Advantageous, Success in the Role.
- Required Experience & Skills must contain only genuinely important requirements.
- Do not invent company facts, compensation, benefits, reporting lines, team size, or technologies unless supplied.
- If improving an existing JD, preserve its factual meaning while making it clearer, sharper and easier to evaluate against candidate evidence.
- Return the complete JD only in the description field.`,
    prompt: `${improving ? 'Improve the existing JD' : 'Create a JD'} for this requirement.\n\nJob Title: ${input.title}\nLocation: ${input.location || 'Not Specified'}\nEmployment Type: ${input.type || 'Not Specified'}\nExperience Level: ${input.experienceLevel || 'Not Specified'}${improving ? `\n\nExisting JD:\n${input.currentDescription}` : ''}`,
    schema: jdSchema,
    schemaName: 'JobDescriptionDraft',
    schemaDescription: 'A complete recruiter-ready job description',
  })
  return result.object.description
}
