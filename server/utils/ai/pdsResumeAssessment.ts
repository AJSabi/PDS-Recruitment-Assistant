import { z } from 'zod'
import { generateStructuredOutput, type ProviderConfig } from './provider'
import type { SkillMatrixPayload } from '../../database/schema/skillMatrix'

const evidenceLevel = z.enum(['strong_evidence', 'partial_evidence', 'no_evidence_found', 'requires_verification'])

export const generatedResumeAssessmentSchema = z.object({
  candidateSnapshot: z.string().min(1),
  jdAlignment: z.string().min(1),
  skillAssessment: z.array(z.object({
    classification: z.string().nullable(),
    skill: z.string().min(1),
    priority: z.enum(['mandatory', 'preferred', 'optional']),
    evidenceLevel,
    evidence: z.string().nullable(),
  })),
  keyGaps: z.array(z.string()).max(10),
  verificationAreas: z.array(z.string()).max(10),
  mandatoryScore: z.number().int().min(0).max(100),
  preferredScore: z.number().int().min(0).max(100),
  experienceScore: z.number().int().min(0).max(100),
  optionalScore: z.number().int().min(0).max(100),
  mandatoryMatch: z.string().min(1),
  keyStrength: z.string().min(1),
  mainGap: z.string().min(1),
})

export type GeneratedResumeAssessment = z.infer<typeof generatedResumeAssessmentSchema>

export async function generatePdsResumeAssessment(
  config: ProviderConfig,
  input: {
    jobTitle: string
    jobDescription: string
    skillMatrix: SkillMatrixPayload
    resumeContent: unknown
  },
): Promise<GeneratedResumeAssessment> {
  const matrixText = input.skillMatrix.classifications.map((classification) => {
    const skills = classification.skills.map(skill => `- ${skill.skill} [${skill.priority}]${skill.rationale ? ` — ${skill.rationale}` : ''}`).join('\n')
    return `${classification.name}\n${skills}`
  }).join('\n\n')

  const resumeText = typeof input.resumeContent === 'string'
    ? input.resumeContent
    : JSON.stringify(input.resumeContent ?? {})

  const result = await generateStructuredOutput(config, {
    system: `You are a recruitment assessment analyst. Evaluate only job-related evidence contained in the candidate resume against the supplied ACTIVE JD and APPROVED Skill Matrix. The Skill Matrix is the authoritative assessment framework; do not replace it with generic role assumptions.

Evidence rules:
- A resume mention is not automatically proof of capability.
- strong_evidence: clear, specific and attributable evidence that the candidate personally performed, owned, delivered or achieved the requirement. Prefer evidence showing scope, scale, outcome, complexity, frequency, recency or measurable results.
- partial_evidence: related evidence exists, but depth, recency, scale, outcome or personal ownership is incomplete or ambiguous.
- requires_verification: the resume contains a relevant claim, keyword or broad responsibility that could satisfy the requirement, but the evidence is too weak to confirm capability without recruiter screening.
- no_evidence_found: the resume does not provide relevant evidence for the requirement.
- Do not infer capability merely from employer name, customer name, job title, seniority, education, certification or industry reputation unless the resume explicitly connects it to performed work.
- Do not convert team-level or company-level achievements into candidate ownership unless the resume attributes the contribution to the candidate.
- Do not infer protected, sensitive or irrelevant personal attributes.
- Assess every skill in the approved matrix exactly once and retain the matrix skill wording and priority.
- Return classification as null only when the source matrix does not provide a usable classification label.
- Return evidence as null only for no_evidence_found. For all other evidence levels, provide a concise factual explanation grounded in the resume.
- Never invent metrics, customers, technologies, responsibilities, achievements, tenure, compensation, notice period or motivations.

Scoring rules:
- Scores are evidence-strength percentages from 0-100, not a hiring decision and not a recommendation.
- Use the approved matrix only; a candidate must not gain points for unrelated strengths.
- Calibrate skill evidence consistently: strong evidence should generally contribute 85-100, partial evidence 45-75, requires verification 20-50, and no evidence 0. Use judgment within those ranges based on evidence quality.
- mandatoryScore reflects Mandatory skill evidence only. Missing or weak Mandatory evidence must materially reduce this score; do not compensate with Preferred or Optional strengths.
- preferredScore reflects Preferred skill evidence only; if the matrix has no Preferred skills, use 100.
- optionalScore reflects Optional evidence only; if the matrix has no Optional skills, use 100.
- experienceScore reflects only role-relevant experience evidenced in the resume: relevance, duration, scope, complexity, achievements and personal ownership. Generic years of experience alone are insufficient for a high score.
- Keep scores internally consistent with skillAssessment. A profile containing several no_evidence_found or requires_verification Mandatory items must not receive a high mandatoryScore.

Output quality rules:
- mandatoryMatch must state the Mandatory evidence picture numerically where possible, for example: "5/8 strongly or partially evidenced; 2 require verification; 1 not evidenced".
- keyStrength must identify the single strongest requirement-relevant evidence point, not a generic positive statement.
- mainGap must identify the single most material requirement-relevant gap or verification risk.
- keyGaps must contain only meaningful requirement gaps and should not repeat the same point in different wording.
- verificationAreas must be practical recruiter-screening checks derived from ambiguous or unproven resume claims. Prioritise Mandatory requirements.
- Candidate Snapshot must be a concise factual summary of relevant experience, scope and evidence; do not recommend, reject or assign Current Fit.
- JD Alignment must explain where the resume aligns with the approved matrix, where evidence is limited, and what must be verified. Do not assign Current Fit or make the hiring decision.`,
    prompt: `JOB TITLE:\n${input.jobTitle}\n\nACTIVE JD:\n${input.jobDescription}\n\nAPPROVED SKILL MATRIX:\n${matrixText}\n\nPARSED RESUME CONTENT:\n${resumeText.slice(0, 45000)}\n\nProduce the structured resume assessment using only the evidence above. Evaluate the approved matrix skill-by-skill before calculating the four scores.`,
    schema: generatedResumeAssessmentSchema,
    schemaName: 'PdsResumeAssessment',
    schemaDescription: 'Evidence-based PDS candidate resume assessment against an approved skill matrix',
  })

  return result.object
}
