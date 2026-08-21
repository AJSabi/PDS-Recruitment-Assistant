import { z } from 'zod'
import { generateStructuredOutput, type ProviderConfig } from './provider'
import type { SkillMatrixInput } from '../schemas/skillMatrix'

const generatedSkillMatrixSchema = z.object({
  classifications: z.array(z.object({
    id: z.string(),
    name: z.string(),
    skills: z.array(z.object({
      id: z.string(),
      skill: z.string(),
      priority: z.enum(['mandatory', 'preferred', 'optional']),
      rationale: z.string().optional(),
    })),
  })).min(4).max(5),
})

export async function generateSkillMatrixFromDescription(
  config: ProviderConfig,
  jobTitle: string,
  jobDescription: string,
): Promise<SkillMatrixInput> {
  const result = await generateStructuredOutput(config, {
    system: `You are an expert recruitment analyst. Convert a job description into a concise, job-related Skill Matrix for recruiter screening.

Rules:
- Return exactly 4 or 5 major role-relevant classifications.
- Classifications should reflect the role, for example Core Experience, Functional/Sales Capability, Technology/Domain Knowledge, Customer/Commercial Capability, Leadership/Qualification. Do not force these examples if the JD needs different groupings.
- Within each classification identify only genuinely useful skills or requirements.
- Mark no more than 2-3 skills per classification as mandatory.
- Aim for 8-12 mandatory skills overall, but use fewer when the JD does not justify more.
- Mandatory means absence would materially affect suitability for the role.
- Use Preferred for important but non-critical requirements.
- Use Optional only for genuine advantages; do not manufacture optional requirements.
- Do not infer protected or irrelevant personal attributes.
- Do not duplicate the same skill across classifications.
- Keep skill names short, specific and recruiter-friendly.
- rationale should briefly explain why the skill matters based on the JD.
- Generate stable lowercase snake_case IDs from the classification/skill names.`,
    prompt: `JOB TITLE: ${jobTitle}\n\nJOB DESCRIPTION:\n${jobDescription}\n\nCreate the Skill Matrix for recruiter review.`,
    schema: generatedSkillMatrixSchema,
    schemaName: 'PdsSkillMatrix',
    schemaDescription: 'PDS recruiter skill matrix generated from a job description',
  })

  return result.object as SkillMatrixInput
}
