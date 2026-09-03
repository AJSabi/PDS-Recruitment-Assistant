import { z } from 'zod'
import { generateStructuredOutput, type ProviderConfig } from './provider'

export const generatedCandidateSummarySchema = z.object({
  candidateSummary: z.string().min(1),
  overallAssessment: z.string().min(1),
  interviewBriefs: z.array(z.object({
    round: z.enum(['recruiter_screening', 'hiring_manager', 'hod', 'hr']),
    brief: z.string().min(1),
  })).max(4),
  finalBrief: z.string().nullable(),
  evidenceConfidence: z.enum(['high', 'medium', 'limited']),
})

export type GeneratedCandidateSummary = z.infer<typeof generatedCandidateSummarySchema>

export async function generatePdsCandidateSummary(
  config: ProviderConfig,
  input: {
    jobTitle: string
    jobDescription?: string | null
    currentStatus: string
    currentFit: string
    score?: number | null
    priority?: string | null
    mandatoryMatch?: string | null
    keyStrength?: string | null
    mainGap?: string | null
    resumeAssessment?: unknown
    screening?: unknown
    evidence: Array<{ type: string; summary?: string | null; payload?: unknown; createdAt?: Date | string | null }>
  },
): Promise<GeneratedCandidateSummary> {
  const result = await generateStructuredOutput(config, {
    system: `You are a recruitment decision-support analyst. Create a concise, evidence-based candidate summary for a single job requirement.

Evidence discipline:
- Use only the evidence supplied. Never invent interview feedback, achievements, compensation, notice period, motivations, availability, reasons for change, customer names, deal values, targets, technologies, certifications or decisions.
- Never convert absence of evidence into evidence of absence. State that something is not established or remains to be validated when appropriate.
- Distinguish clearly between resume evidence, recruiter screening evidence and evidence from Hiring Manager, HOD or HR rounds.
- Later, direct recorded evidence can confirm, strengthen, weaken or contradict earlier resume claims. When evidence conflicts, describe the conflict rather than silently resolving it.
- Do not infer protected, sensitive or irrelevant personal attributes.
- The APPROVED requirement and recorded evidence are authoritative. Do not substitute generic assumptions about the job title.

Output rules:
- candidateSummary: 4-6 concise sentences describing current requirement-specific suitability, strongest relevant evidence, critical Mandatory alignment, and the most material remaining concern. It must reflect the newest recorded evidence.
- overallAssessment: 2-4 sentences consolidating the evidence and explaining the current fit. Treat CONFIRMED STATUS and CURRENT FIT as recorded workflow facts: do not silently upgrade, downgrade or overwrite them.
- interviewBriefs: include a round only when recorded evidence for that round exists. Do not create a Hiring Manager, HOD or HR brief from resume or recruiter evidence alone. Keep each brief to 1-3 sentences and identify unresolved validation points when relevant.
- finalBrief: return null unless CONFIRMED STATUS itself represents a meaningful late/final workflow outcome such as not_proceeding, offer_stage, offer_accepted, offer_declined, joined or closed. An AI recommendation, Current Fit label, resume score, screening recommendation or planned next step is not a final outcome.
- When finalBrief is allowed, report the confirmed outcome and the evidence trail that led to it. Do not imply that AI made the hiring decision.
- evidenceConfidence: high only when multiple concrete and materially relevant evidence sources corroborate the assessment; medium when evidence is useful but incomplete or partly unresolved; limited when evidence is mostly resume-only, sparse, contradictory or materially unverified.
- Do not make a hiring decision on behalf of the recruiter or management.`,
    prompt: `JOB TITLE:\n${input.jobTitle}\n\nACTIVE JD:\n${input.jobDescription ?? 'Not provided'}\n\nCONFIRMED STATUS:\n${input.currentStatus}\n\nCURRENT FIT:\n${input.currentFit}\n\nAI MATCH SCORE:\n${input.score ?? 'Not available'}\n\nPRIORITY:\n${input.priority ?? 'Not available'}\n\nMANDATORY MATCH:\n${input.mandatoryMatch ?? 'Not available'}\n\nKEY STRENGTH:\n${input.keyStrength ?? 'Not available'}\n\nMAIN GAP:\n${input.mainGap ?? 'Not available'}\n\nRESUME ASSESSMENT:\n${JSON.stringify(input.resumeAssessment ?? {}).slice(0, 18000)}\n\nRECRUITER SCREENING:\n${JSON.stringify(input.screening ?? {}).slice(0, 12000)}\n\nRECORDED EVIDENCE (chronological):\n${JSON.stringify(input.evidence ?? []).slice(0, 18000)}\n\nProduce the structured candidate summary using the latest and strongest recorded evidence without inventing missing facts.`,
    schema: generatedCandidateSummarySchema,
    schemaName: 'PdsCandidateSummary',
    schemaDescription: 'Evidence-based candidate summary with interview briefs and final recruitment brief',
  })

  return result.object
}
