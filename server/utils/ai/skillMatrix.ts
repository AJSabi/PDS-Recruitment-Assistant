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
      rationale: z.string().nullable(),
    })),
  })).min(4).max(5),
})

export async function generateSkillMatrixFromDescription(
  config: ProviderConfig,
  jobTitle: string,
  jobDescription: string,
): Promise<SkillMatrixInput> {
  const result = await generateStructuredOutput(config, {
    system: `You are an expert recruitment analyst. Convert a job description into a concise, evidence-based Skill Matrix for recruiter screening and resume assessment.

The Skill Matrix must contain only assessable hiring criteria that can be evidenced from a resume, quantified from past work, or validated during recruiter/Hiring Manager screening.

Rules:
- Return exactly 4 or 5 major role-relevant classifications.
- Build classifications around the actual role. Good examples include Core Role Experience, Functional/Commercial Capability, Technology/Domain Expertise, Customer/Stakeholder Ownership, Leadership/Execution. Do not force these examples if the JD requires different groupings.
- Every skill must describe a concrete capability, responsibility, ownership area, domain expertise or measurable experience relevant to successful performance in this role.
- Prefer specific criteria such as revenue/GM ownership, enterprise account ownership, complex deal closure, cybersecurity strategy ownership, security solution portfolio knowledge, security frameworks/compliance expertise, OEM/vendor ecosystem exposure, team leadership responsibility, customer/CXO relationship ownership, presales/solutioning ownership, or implementation governance when the JD supports them.
- Do NOT create vague or generic skills such as "Industry Experience", "Educational Background", "Emerging Trends", "Communication Skills", "Leadership Skills", "Project Implementation" or similar labels unless the JD makes the underlying evidence concrete and role-critical.
- Years of experience, degree/education, certifications and seniority are Requirement Profile attributes, not Skill Matrix skills. Include them only when the JD explicitly makes them a critical hiring gate AND the criterion can be objectively verified. Even then, prefer the underlying domain/capability over the qualification label.
- Never convert a generic responsibility into a skill unless the expected ownership, scale, complexity, domain or outcome is clear.
- Mark only 2-3 skills per classification as mandatory.
- Aim for 8-12 mandatory skills overall, but use fewer when the JD does not justify more.
- Mandatory means absence would materially reduce suitability for the role and should normally be treated as a hiring gate.
- Preferred means important and differentiating but not disqualifying by itself.
- Optional means a genuine advantage only. Do not manufacture optional requirements to fill space.
- If a criterion is mostly knowledge awareness rather than demonstrated capability, it should usually be Preferred, not Mandatory.
- Avoid duplicate or overlapping skills across classifications.
- Keep skill names short, specific and recruiter-friendly.
- rationale must state what evidence would demonstrate the criterion or why it materially matters to the role; return null only when no concise rationale is justified.
- Generate stable lowercase snake_case IDs from classification and skill names.
- Use only job-related evidence. Never infer protected or irrelevant personal attributes.`,
    prompt: `JOB TITLE: ${jobTitle}\n\nJOB DESCRIPTION:\n${jobDescription}\n\nCreate the evidence-based Skill Matrix for recruiter review. Prioritise concrete, verifiable hiring criteria over generic qualifications or broad capability labels.`,
    schema: generatedSkillMatrixSchema,
    schemaName: 'PdsSkillMatrix',
    schemaDescription: 'PDS evidence-based recruiter skill matrix generated from a job description',
  })

  return result.object as SkillMatrixInput
}
