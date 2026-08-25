import { z } from 'zod'
import { generateStructuredOutput, type ProviderConfig } from './provider'

const questionSchema = z.object({
  id: z.string().min(1).max(100),
  question: z.string().min(1).max(1000),
  options: z.array(z.string().min(1).max(500)).min(4).max(7).nullable(),
  verificationArea: z.string().max(500).nullable(),
})

const questionsSchema = z.object({ questions: z.array(questionSchema).min(1).max(10) })

const interpretationSchema = z.object({
  finalFit: z.enum(['strong_fit', 'potential_fit', 'borderline_requires_validation', 'significant_gap']),
  recommendedNextStep: z.enum(['proceed_to_hiring_manager_round', 'hold_for_comparison', 'reassess', 'recruiter_decision_required']),
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

The candidate has already been analysed against an APPROVED Skill Matrix. The purpose of this screening is NOT to repeat the resume review. It is to validate the most important uncertainties found in the Skill Assessment.

Question priority order:
1. Mandatory skills marked Requires Verification.
2. Mandatory skills marked No Evidence Found.
3. Mandatory skills marked Partial Evidence.
4. Important Preferred skills with Requires Verification, No Evidence Found or Partial Evidence.
5. Strong Evidence claims only when ownership, scale, complexity, achievement, recency or actual hands-on responsibility still needs validation.

Rules:
- Generate a maximum of 10 questions and only as many as materially useful for this candidate.
- Every question must trace to a specific Skill Assessment item, Key Gap, Verification Area or material JD requirement.
- Do not generate generic interview questions merely because they are common for the role.
- Do not ask again for information already strongly evidenced unless its scale, ownership or result needs confirmation.
- Prioritise practical evidence: what the candidate personally did, customer/account ownership, target/revenue/GM responsibility, project or deal size, technology/domain exposure, complexity, measurable outcome and recency where relevant to the role.
- Convert vague resume claims into verification questions.
- Where resume claims conflict or look unusually broad, ask a neutral clarification question rather than assuming the claim is false.
- Avoid duplicate questions covering the same uncertainty.
- Keep questions concise and answerable in roughly 30-90 seconds.
- Provide 4-6 realistic selectable answer options whenever this speeds recruiter capture. Add "Other / Exact Response" where free text may be needed.
- If selectable options would not help, return options as null.
- Options must represent plausible evidence levels or factual ranges; they must never act as automatic accept/reject answers.
- verificationArea must name the exact skill, gap or claim being validated; use null only when there is no distinct validation area.
- Use sequential IDs q1, q2, etc.
- Use only job-related evidence. Never ask about protected, sensitive or irrelevant personal characteristics.`,
    prompt: `JOB TITLE:\n${input.jobTitle}\n\nACTIVE JD:\n${input.jobDescription}\n\nAPPROVED SKILL MATRIX:\n${JSON.stringify(input.approvedMatrix)}\n\nCANDIDATE AI SKILL/RESUME ASSESSMENT:\n${JSON.stringify(input.resumeAssessment)}\n\nCreate candidate-specific recruiter screening questions from the unresolved or important validation points in the Skill Assessment.`,
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
- Resume evidence is provisional; recruiter screening can confirm, strengthen, weaken or contradict it.
- Give more weight to specific recruiter-screening evidence than to unsupported resume wording.
- Judge the candidate against the APPROVED Skill Matrix and Active JD, not against other candidates.
- Use only job-related evidence.
- Do not infer protected or irrelevant personal attributes.
- finalFit must be Strong Fit, Potential Fit, Borderline/Requires Validation, or Significant Gap.
- This is a recommendation to the recruiter, never an automatic rejection decision.
- Recommend Proceed to Hiring Manager Round when critical evidence is sufficiently strong; Hold for Comparison when viable but comparative; Reassess when evidence or requirement materially changed; Recruiter Decision Required when critical evidence is conflicting or incomplete.
- Explicitly highlight contradictions between resume claims and recruiter responses.
- validationFocus should contain at most 5 concise unresolved items for Hiring Manager validation.`,
    prompt: `JOB TITLE:\n${input.jobTitle}\n\nACTIVE JD:\n${input.jobDescription}\n\nAPPROVED SKILL MATRIX:\n${JSON.stringify(input.approvedMatrix)}\n\nRESUME/SKILL ASSESSMENT:\n${JSON.stringify(input.resumeAssessment)}\n\nSCREENING QUESTIONS:\n${JSON.stringify(input.questions)}\n\nRECRUITER RESPONSES:\n${JSON.stringify(input.responses)}\n\nInterpret the completed recruiter screening against the approved requirement.`,
    schema: interpretationSchema,
    schemaName: 'PdsScreeningInterpretation',
  })
  return result.object
}
