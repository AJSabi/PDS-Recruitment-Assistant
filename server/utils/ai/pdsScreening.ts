import { z } from 'zod'
import { generateStructuredOutput, type ProviderConfig } from './provider'

const followUpSchema = z.object({
  whenOption: z.string().min(1).max(500),
  question: z.string().min(1).max(1000),
  options: z.array(z.string().min(1).max(500)).min(2).max(7).nullable(),
  verificationArea: z.string().max(500).nullable(),
})

const questionSchema = z.object({
  id: z.string().min(1).max(100),
  question: z.string().min(1).max(1000),
  options: z.array(z.string().min(1).max(500)).min(4).max(7).nullable(),
  verificationArea: z.string().max(500).nullable(),
  followUps: z.array(followUpSchema).max(3).nullable(),
})

const questionsSchema = z.object({ questions: z.array(questionSchema).min(1).max(8) })

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

The candidate has already been analysed against an APPROVED Skill Matrix. Screening must resolve only the uncertainties that materially affect suitability for this specific requirement.

QUESTION PRIORITY
1. Mandatory skills marked requires_verification.
2. Mandatory skills marked no_evidence_found.
3. Mandatory skills marked partial_evidence.
4. Contradictions between resume claims, quantified achievements, role scope or ownership.
5. Important Preferred skills with unresolved evidence.
6. Strong claims only where ownership, scale, complexity, achievement or recency matters.

RECRUITER-SCREENING STANDARD
- Generate 5-8 base questions, never more than 8. Keep total runtime questions including any conditional follow-ups at 10 or fewer.
- Every question must trace to one specific Skill Assessment item, Key Gap, Verification Area or material JD requirement.
- Ask for PERSONAL contribution, ownership, scale, recency and measurable result where relevant.
- Avoid generic interview questions and duplicate validation areas.
- Keep each question concise and answerable in 30-90 seconds.

MCQ-FIRST CAPTURE
- Prefer selectable factual options for almost every recruiter question because the recruiter must capture answers quickly during a live phone call.
- Provide 4-6 realistic options whenever possible.
- Use ownership, scale, recency, frequency, customer segment, deal/project size or evidence-state options.
- Include "Other / Exact Response" when a precise answer may be needed.
- Return options as null only when a narrative answer is genuinely unavoidable.
- Options are evidence capture, not pass/fail scores.

ADAPTIVE FOLLOW-UPS
- For a base question where a particular answer should materially change what the recruiter asks next, provide 1-3 conditional followUps.
- Each followUp must reference an exact base option through whenOption.
- Example: if ownership answer is "Supported", a follow-up may ask what the candidate personally owned; if "Owned end-to-end", a follow-up may ask scale/result.
- Do not create follow-ups for every option. Create them only where the answer changes the validation path.
- Follow-up questions should also use MCQ options where practical.
- Never exceed a plausible maximum of 10 total questions after branching.

QUALITY
- If the question could be asked unchanged to almost every candidate, rewrite it using this candidate's evidence.
- If the answer would not change confidence in a Mandatory/important Preferred criterion, remove it.
- Use only job-related evidence; never ask about protected or irrelevant personal characteristics.`,
    prompt: `JOB TITLE:\n${input.jobTitle}\n\nACTIVE JD:\n${input.jobDescription}\n\nAPPROVED SKILL MATRIX:\n${JSON.stringify(input.approvedMatrix)}\n\nCANDIDATE AI SKILL/RESUME ASSESSMENT:\n${JSON.stringify(input.resumeAssessment)}\n\nCreate an MCQ-first, candidate-specific recruiter screening set with conditional follow-ups only where the candidate's answer should materially change the next validation question.`,
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
- Give more weight to specific recruiter-screening evidence than to unsupported or vague resume wording.
- Judge the candidate against the APPROVED Skill Matrix and Active JD, not against other candidates.
- Evaluate personal ownership, scale, complexity, recency and measurable outcome where material.
- Do not treat selectable answer labels as scores by themselves; interpret the underlying evidence in context.
- A candidate must not be classified Strong Fit while a genuinely critical Mandatory requirement remains unsupported, materially contradicted or unresolved.
- Potential Fit may be used where most critical evidence is credible but one or more non-critical areas still need Hiring Manager validation.
- Borderline/Requires Validation is appropriate where critical evidence remains incomplete, ambiguous or mixed.
- Significant Gap is an evidence-based assessment, not an automatic rejection instruction.
- This is a recommendation to the recruiter, never an automatic rejection decision.
- Recommend Proceed to Hiring Manager Round when critical evidence is sufficiently strong; Hold for Comparison when viable but comparative; Reassess when evidence or requirement materially changed; Recruiter Decision Required when critical evidence is conflicting or incomplete.
- Explicitly highlight contradictions between resume claims and recruiter responses.
- conversationBrief must summarise what was actually validated.
- validationFocus should contain at most 5 concise unresolved items for Hiring Manager validation.`,
    prompt: `JOB TITLE:\n${input.jobTitle}\n\nACTIVE JD:\n${input.jobDescription}\n\nAPPROVED SKILL MATRIX:\n${JSON.stringify(input.approvedMatrix)}\n\nRESUME/SKILL ASSESSMENT:\n${JSON.stringify(input.resumeAssessment)}\n\nSCREENING QUESTIONS:\n${JSON.stringify(input.questions)}\n\nRECRUITER RESPONSES:\n${JSON.stringify(input.responses)}\n\nInterpret the completed recruiter screening against the approved requirement.`,
    schema: interpretationSchema,
    schemaName: 'PdsScreeningInterpretation',
  })
  return result.object
}
