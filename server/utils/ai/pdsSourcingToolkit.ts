import { z } from 'zod'
import { generateStructuredOutput, type ProviderConfig } from './provider'

const sourcingToolkitSchema = z.object({
  majorSkills: z.array(z.string().min(1).max(160)).min(5).max(12),
  booleanSearch: z.string().min(1).max(3000),
})

export async function generatePdsSourcingToolkit(
  config: ProviderConfig,
  input: {
    jobTitle: string
    jobDescription: string
    approvedMatrix?: unknown
    recruiterFeedback?: string | null
    currentBooleanSearch?: string | null
  },
) {
  const result = await generateStructuredOutput(config, {
    system: `You create practical sourcing aids for PDS recruiters using Indian and enterprise job portals.

The Active JD is authoritative. When an approved Skill Matrix is supplied, use it to clarify the true Mandatory and Preferred evidence without inventing requirements.

MAJOR SKILLS
- Return 5-12 concise major skill sets that a recruiter should actively search for in profiles.
- Prioritise JD-critical capability, domain, technology, commercial ownership, customer segment, delivery scope or leadership responsibility as applicable.
- Use recruiter-searchable wording rather than long competency sentences.
- Do not add technologies, industries, certifications or responsibilities absent from the JD/approved matrix.
- Do not include protected/personal characteristics.

BOOLEAN SEARCH
- Produce one practical Boolean string for a job portal/resume database.
- Use parentheses, AND, OR and quoted phrases where useful.
- Include common title/skill synonyms only where they are reasonable extensions of the supplied JD.
- Keep the string broad enough to source viable candidates; do not force every Preferred/Optional item with AND.
- Put genuinely critical role families and Mandatory capabilities in the core AND logic; use OR groups for synonyms and related terms.
- Do not include location unless the recruiter feedback explicitly asks for it.
- Do not include years of experience, salary, age, gender or other personal filters in the Boolean string.
- Return only a portal-ready Boolean expression, without explanation.

RECRUITER FEEDBACK
- If feedback is supplied, revise the search to reflect it while remaining faithful to the JD.
- If a current Boolean string is supplied, improve that string rather than unnecessarily replacing useful recruiter edits.
`,
    prompt: `JOB TITLE:\n${input.jobTitle}\n\nACTIVE JD:\n${input.jobDescription}\n\nAPPROVED SKILL MATRIX:\n${JSON.stringify(input.approvedMatrix ?? null)}\n\nCURRENT BOOLEAN SEARCH:\n${input.currentBooleanSearch ?? ''}\n\nRECRUITER FEEDBACK:\n${input.recruiterFeedback ?? ''}\n\nGenerate the major recruiter-searchable skill sets and a practical Boolean search string.`,
    schema: sourcingToolkitSchema,
    schemaName: 'PdsSourcingToolkit',
    schemaDescription: 'PDS major sourcing skills and recruiter-editable Boolean job-portal search string',
  })

  return result.object
}
