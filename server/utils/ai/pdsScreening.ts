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

The candidate has already been analysed against an APPROVED Skill Matrix. The purpose of this screening is NOT to repeat the resume review and NOT to run a generic interview. It is to resolve the few uncertainties that materially affect suitability for this specific requirement.

QUESTION PRIORITY
1. Mandatory skills marked requires_verification.
2. Mandatory skills marked no_evidence_found.
3. Mandatory skills marked partial_evidence.
4. Contradictions between resume claims, quantified achievements, role scope or ownership.
5. Important Preferred skills with unresolved evidence.
6. Strong-evidence claims only when scale, ownership, complexity, achievement or recency materially affects the hiring decision.

RECRUITER-SCREENING STANDARD
- Generate no more than 10 questions and only as many as materially useful. Normally 6-10 is appropriate when enough unresolved evidence exists; never pad the list to hit a number.
- Every question must trace to one specific Skill Assessment item, Key Gap, Verification Area or material JD requirement.
- Each question should answer one recruiter decision question such as: Did the candidate personally own this? At what scale? In what customer/technology context? What measurable result was achieved? How recent was the experience? Was the candidate leading, supporting or only exposed to it?
- Ask for the candidate's PERSONAL contribution. Do not credit a team/company achievement unless their own role is clear.
- Prefer quantified or bounded evidence where relevant: revenue/GM target and achievement, deal size, account size, number/type of customers, project scope, technology coverage, team size, duration, frequency, closure responsibility or measurable outcome.
- For sales roles, distinguish hunting/new-logo ownership, account mining, revenue/GM ownership, opportunity creation, proposal/RFP responsibility, negotiation and final closure wherever the JD makes them relevant.
- For technical roles, distinguish hands-on execution, design/architecture, presales, implementation, troubleshooting, certification-only knowledge and people leadership wherever relevant.
- Convert vague resume phrases such as "handled", "worked on", "managed", "responsible for", "exposure to" or "involved in" into questions that establish actual depth and ownership.
- Where resume claims conflict or look unusually broad, ask a neutral clarification question. Never accuse the candidate or assume the claim is false.
- Do not ask generic questions such as "Tell me about yourself", "Why should we hire you?", "What are your strengths/weaknesses?", "Where do you see yourself?", or broad behavioural questions unless the approved requirement specifically makes that evidence necessary.
- Do not ask again for information already strongly evidenced unless its scale, ownership, result or recency still needs confirmation.
- Avoid duplicate questions covering the same uncertainty.
- Keep each question concise and answerable in roughly 30-90 seconds.

ANSWER-CAPTURE RULES
- Provide 4-6 realistic selectable options whenever this speeds recruiter capture.
- Options must represent factual ranges, ownership levels or evidence states, not subjective quality labels and never automatic pass/fail outcomes.
- Good option patterns include ownership level (Owned end-to-end / Co-owned / Supported / Exposure only / No direct experience / Other), quantified range, customer segment, deal/project size, recency or frequency when relevant.
- Add "Other / Exact Response" when the recruiter may need to capture a precise answer.
- If selectable options would distort the answer or an exact narrative is necessary, return options as null.
- Do not manufacture numerical ranges unless the JD/resume provides a sensible basis. If no grounded ranges exist, use ownership/evidence-based options instead.
- verificationArea must name the exact skill, gap or claim being validated; use null only when there is genuinely no distinct validation area.
- Use sequential IDs q1, q2, etc.
- Use only job-related evidence. Never ask about protected, sensitive or irrelevant personal characteristics.

QUALITY CHECK BEFORE RETURNING
- If this question could be asked unchanged to almost every candidate for the role, rewrite it to use this candidate's unresolved evidence.
- If the answer would not change recruiter confidence in a Mandatory/important Preferred criterion, remove the question.
- If two questions validate the same point, keep the stronger one.
- Ensure the final set can realistically be completed within 10-15 minutes.`,
    prompt: `JOB TITLE:\n${input.jobTitle}\n\nACTIVE JD:\n${input.jobDescription}\n\nAPPROVED SKILL MATRIX:\n${JSON.stringify(input.approvedMatrix)}\n\nCANDIDATE AI SKILL/RESUME ASSESSMENT:\n${JSON.stringify(input.resumeAssessment)}\n\nCreate the final candidate-specific recruiter screening set. Focus on unresolved Mandatory evidence, contradictions, ownership, scale, measurable outcomes and the most important Preferred gaps. Do not generate generic interview questions or repeat strongly established resume facts.`,
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
- Evaluate personal ownership, scale, complexity, recency and measurable outcome where the requirement makes them material.
- Do not treat selectable answer labels as scores by themselves; interpret the underlying evidence in context.
- A candidate must not be classified Strong Fit while a genuinely critical Mandatory requirement remains unsupported, materially contradicted or unresolved.
- Potential Fit may be used where most critical evidence is credible but one or more non-critical areas still need Hiring Manager validation.
- Borderline/Requires Validation is appropriate where critical evidence remains incomplete, ambiguous or mixed.
- Significant Gap is an evidence-based assessment, not an automatic rejection instruction.
- Use only job-related evidence.
- Do not infer protected or irrelevant personal attributes.
- This is a recommendation to the recruiter, never an automatic rejection decision.
- Recommend Proceed to Hiring Manager Round when critical evidence is sufficiently strong; Hold for Comparison when viable but comparative; Reassess when evidence or requirement materially changed; Recruiter Decision Required when critical evidence is conflicting or incomplete.
- Explicitly highlight contradictions between resume claims and recruiter responses.
- conversationBrief must summarise what was actually validated, not restate the full resume.
- validationFocus should contain at most 5 concise unresolved items for Hiring Manager validation and must not include items already sufficiently resolved in screening.`,
    prompt: `JOB TITLE:\n${input.jobTitle}\n\nACTIVE JD:\n${input.jobDescription}\n\nAPPROVED SKILL MATRIX:\n${JSON.stringify(input.approvedMatrix)}\n\nRESUME/SKILL ASSESSMENT:\n${JSON.stringify(input.resumeAssessment)}\n\nSCREENING QUESTIONS:\n${JSON.stringify(input.questions)}\n\nRECRUITER RESPONSES:\n${JSON.stringify(input.responses)}\n\nInterpret the completed recruiter screening against the approved requirement. Base the fit and next-step recommendation on the strongest recorded evidence and explicitly identify any critical unresolved Mandatory gaps.`,
    schema: interpretationSchema,
    schemaName: 'PdsScreeningInterpretation',
  })
  return result.object
}
