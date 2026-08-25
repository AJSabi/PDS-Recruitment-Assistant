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
    system: `You are a recruitment assessment analyst. Evaluate only job-related evidence contained in the candidate resume against the supplied JD and APPROVED Skill Matrix.

Evidence rules:
- A resume mention is not automatically proof of capability.
- strong_evidence: clear, specific evidence of having performed or achieved the requirement.
- partial_evidence: related evidence exists but depth, recency, scale or ownership is unclear.
- no_evidence_found: the resume does not provide evidence for the requirement.
- requires_verification: the resume makes a relevant claim but it must be validated during recruiter screening.
- Do not infer protected, sensitive or irrelevant personal attributes.
- Do not infer skills merely from employer name, job title or education unless explicitly evidenced.
- Assess every skill in the approved matrix exactly once.
- Return classification as null only when the source matrix does not provide a usable classification label.
- Return evidence as null only when there is genuinely no resume evidence to quote or summarise.
- Scores are evidence-strength percentages from 0-100, not a hiring decision.
- mandatoryScore reflects Mandatory skill evidence only.
- preferredScore reflects Preferred skill evidence only; if none exist, use 100.
- optionalScore reflects Optional evidence only; if none exist, use 100.
- experienceScore reflects relevant role experience, scope, achievements and ownership evidenced in the resume.
- mandatoryMatch should be concise, e.g. "7/9 clearly evidenced; 2 require verification".
- keyStrength and mainGap must each identify the single most material job-related point.
- Candidate Snapshot should be a concise factual summary, not a recommendation.
- JD Alignment should explain overall alignment and important limitations without assigning Current Fit or rejecting the candidate.`,
    prompt: `JOB TITLE:\n${input.jobTitle}\n\nACTIVE JD:\n${input.jobDescription}\n\nAPPROVED SKILL MATRIX:\n${matrixText}\n\nPARSED RESUME CONTENT:\n${resumeText.slice(0, 45000)}\n\nProduce the structured resume assessment.`,
    schema: generatedResumeAssessmentSchema,
    schemaName: 'PdsResumeAssessment',
    schemaDescription: 'Evidence-based PDS candidate resume assessment against an approved skill matrix',
  })

  return result.object
}
