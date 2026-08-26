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

Rules:
- Use only the evidence supplied. Never invent interview feedback, achievements, compensation, notice period, motivations or decisions.
- Do not infer protected, sensitive or irrelevant personal attributes.
- Distinguish resume evidence from recruiter screening and interview evidence.
- candidateSummary: 4-6 concise sentences describing overall suitability, strongest relevant evidence, critical mandatory-skill alignment and the most material remaining concern.
- overallAssessment: 2-4 sentences consolidating all available evidence and explaining the current fit without overriding the confirmed recruitment status.
- interviewBriefs: include a round only when evidence for that round exists. Keep each brief to 1-3 sentences and state unresolved validation points when relevant.
- finalBrief: return null unless the confirmed status represents a meaningful final/late-stage outcome such as not_proceeding, offer_stage, offer_accepted, offer_declined, joined or closed. When present, summarize the recruitment outcome and the strongest evidence supporting it.
- evidenceConfidence: high only when multiple concrete evidence sources support the assessment; medium when evidence is reasonable but incomplete; limited when mostly resume-only or sparse.
- Do not make a hiring decision on behalf of the recruiter.`,
    prompt: `JOB TITLE:\n${input.jobTitle}\n\nACTIVE JD:\n${input.jobDescription ?? 'Not provided'}\n\nCONFIRMED STATUS:\n${input.currentStatus}\n\nCURRENT FIT:\n${input.currentFit}\n\nAI MATCH SCORE:\n${input.score ?? 'Not available'}\n\nPRIORITY:\n${input.priority ?? 'Not available'}\n\nMANDATORY MATCH:\n${input.mandatoryMatch ?? 'Not available'}\n\nKEY STRENGTH:\n${input.keyStrength ?? 'Not available'}\n\nMAIN GAP:\n${input.mainGap ?? 'Not available'}\n\nRESUME ASSESSMENT:\n${JSON.stringify(input.resumeAssessment ?? {}).slice(0, 18000)}\n\nRECRUITER SCREENING:\n${JSON.stringify(input.screening ?? {}).slice(0, 12000)}\n\nRECORDED EVIDENCE:\n${JSON.stringify(input.evidence ?? []).slice(0, 18000)}\n\nProduce the structured candidate summary.`,
    schema: generatedCandidateSummarySchema,
    schemaName: 'PdsCandidateSummary',
    schemaDescription: 'Evidence-based candidate summary with interview briefs and final recruitment brief',
  })

  return result.object
}
