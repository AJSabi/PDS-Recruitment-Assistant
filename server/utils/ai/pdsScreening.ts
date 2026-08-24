import { z } from 'zod'
import { generateStructuredOutput, type ProviderConfig } from './provider'

const questionSchema = z.object({
  id: z.string().min(1).max(100),
  question: z.string().min(1).max(1000),
  options: z.array(z.string().min(1).max(500)).min(4).max(7).optional(),
  verificationArea: z.string().max(500).optional(),
})

const questionsSchema = z.object({ questions: z.array(questionSchema).min(1).max(10) })

const interpretationSchema = z.object({
  finalFit: z.enum(['strong_fit', 'potential_fit', 'borderline_requires_validation', 'significant_gap']),
  recommendedNextStep: z.enum(['proceed_to_hod_round', 'hold_for_comparison', 'reassess', 'recruiter_decision_required']),
  conversationBrief: z.string().min(1).max(3000),
  validationFocus: z.array(z.string().min(1).max(500)).max(5),
  rationale: z.string().min(1).max(2000),
})

export async function generatePdsScreeningQuestions(
  config: ProviderConfig,
  input: { jobTitle: string; jobDescription: string; approvedMatrix: unknown; resumeAssessment: unknown },
) {
  const result = await generateStructuredOutput(config, {
    system: `You create practical recruiter screening questions for a 10-15 minute phone screening.
Rules:
- Generate no more than 10 questions and only as many as materially useful.
- Base questions on the Active JD, APPROVED Skill Matrix, resume evidence, gaps and verification areas.
- Prioritise Mandatory skills, ownership, scale, outcomes, target achievement, relevant domain exposure and unclear resume claims.
- Do not ask generic theory questions when an experience-verification question would work better.
- Do not ask about protected, sensitive or irrelevant personal characteristics.
- Each question should be concise and answerable in roughly 30-90 seconds.
- Provide 4-6 realistic selectable answer options when structured answers help the recruiter move quickly; include an "Other / Exact Response" option when appropriate.
- Options must not imply that one answer is automatically accepted or rejected.
- verificationArea should state what evidence or uncertainty the question is intended to validate.
- Use sequential stable IDs q1, q2, etc.`,
    prompt: `JOB TITLE:\n${input.jobTitle}\n\nACTIVE JD:\n${input.jobDescription}\n\nAPPROVED SKILL MATRIX:\n${JSON.stringify(input.approvedMatrix)}\n\nRESUME ASSESSMENT:\n${JSON.stringify(input.resumeAssessment)}\n\nGenerate the recruiter screening questions.`,
    schema: questionsSchema,
    schemaName: 'PdsScreeningQuestions',
  })
  return result.object.questions
}

export async function interpretPdsScreening(
  config: ProviderConfig,
  input: { jobTitle: string; jobDescription: string; approvedMatrix: unknown; resumeAssessment: unknown; questions: unknown; responses: unknown },
) {
  const result = await generateStructuredOutput(config, {
    system: `You interpret recruiter screening evidence for a hiring workflow.
Rules:
- Resume evidence is provisional; recruiter screening can confirm, weaken or contradict it.
- Use only job-related evidence.
- Do not infer protected or irrelevant personal attributes.
- finalFit must be one of Strong Fit, Potential Fit, Borderline/Requires Validation, or Significant Gap.
- This is a recommendation to the recruiter, never an automatic rejection decision.
- recommend Proceed to HOD Round when evidence is sufficiently strong; Hold for Comparison when viable but comparative; Reassess when evidence/requirement materially changed; Recruiter Decision Required when evidence is conflicting or incomplete.
- Highlight contradictions between resume claims and recruiter responses.
- validationFocus should contain at most 5 concise items for HOD/interview validation.`,
    prompt: `JOB TITLE:\n${input.jobTitle}\n\nACTIVE JD:\n${input.jobDescription}\n\nAPPROVED SKILL MATRIX:\n${JSON.stringify(input.approvedMatrix)}\n\nRESUME ASSESSMENT:\n${JSON.stringify(input.resumeAssessment)}\n\nSCREENING QUESTIONS:\n${JSON.stringify(input.questions)}\n\nRECRUITER RESPONSES:\n${JSON.stringify(input.responses)}\n\nInterpret the completed recruiter screening.`,
    schema: interpretationSchema,
    schemaName: 'PdsScreeningInterpretation',
  })
  return result.object
}
