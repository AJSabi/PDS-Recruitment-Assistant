import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readSource = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

describe('PDS Move to Recruitment reuse policy', () => {
  it('reuses the persisted Candidate Pool assessment instead of re-running resume AI during promotion', () => {
    const source = readSource('server/api/jobs/[id]/talent-pool/[matchId]/promote.post.ts')
    expect(source).toContain('await db.insert(resumeAssessment).values({')
    expect(source).toContain('candidateSnapshot: match.candidateSnapshot')
    expect(source).toContain('skillAssessment: match.skillAssessment')
    expect(source).toContain('mandatoryScore: match.mandatoryScore')
    expect(source).toContain('provisionalFitScore: match.score')
    expect(source).not.toContain('generatePdsResumeAssessment')
  })

  it('inherits recruiter ownership from the requirement allocation and seeds the AI summary from stored evidence', () => {
    const source = readSource('server/api/jobs/[id]/talent-pool/[matchId]/promote.post.ts')
    expect(source).toContain('assignedRecruiterId: requirementState?.ownerUserId ?? null')
    expect(source).toContain('aiCandidateSummary: match.candidateSnapshot')
    expect(source).toContain('aiOverallAssessment: match.jdAlignment')
    expect(source).toContain("currentFit: 'not_yet_assessed'")
  })

  it('does not spend AI on Move to Recruitment; screening questions require a separate recruiter action', () => {
    const source = readSource('server/api/jobs/[id]/talent-pool/[matchId]/promote.post.ts')
    expect(source).not.toContain('generatePdsScreeningQuestions')
    expect(source).not.toContain('loadAiConfig')
    expect(source).toContain("nextAction: 'Start Recruiter Screening'")
    expect(source).toContain('screeningQuestionsGenerated: 0')
    expect(source).toContain('screeningQuestionsRequireExplicitRecruiterAction: true')
    expect(source).toContain('aiCalls: 0')
  })
})

describe('PDS Recruiter Screening persistence policy', () => {
  it('persists each answer and any matching follow-up before returning the next question', () => {
    const source = readSource('server/api/applications/[id]/screening/answer.post.ts')
    expect(source).toContain('const updatedResponses: ScreeningResponse[] = [...responses')
    expect(source).toContain('.set({ responses: updatedResponses, questions: updatedQuestions, updatedAt: now })')
    expect(source).toContain('const nextQuestion = updatedQuestions.find')
    expect(source).toContain('adaptiveFollowUpAdded')
  })

  it('prevents skipping ahead or completing an incomplete screening', () => {
    const answerSource = readSource('server/api/applications/[id]/screening/answer.post.ts')
    const completeSource = readSource('server/api/applications/[id]/screening/complete.post.ts')
    expect(answerSource).toContain('Answer the current screening question before moving to the next question.')
    expect(completeSource).toContain('Complete all screening questions before final assessment.')
  })

  it('stores completed screening evidence, preserves the decision outcome, and marks the AI Candidate Summary stale', () => {
    const source = readSource('server/api/applications/[id]/screening/complete.post.ts')
    expect(source).toContain('const finalStatus = completionStageForDecision(body.recommendedNextStep)')
    expect(source).toContain('lastStatus: finalStatus')
    expect(source).toContain('aiSummaryStale: true')
    expect(source).toContain("type: 'recruiter_screening'")
    expect(source).toContain('resultingStage: finalStatus')
    expect(source).toContain('responses,')
    expect(source).toContain('requirementRevision,')
  })

  it('protects screening read/write paths with application-level access checks', () => {
    const paths = [
      'server/api/applications/[id]/screening/index.get.ts',
      'server/api/applications/[id]/screening/start.post.ts',
      'server/api/applications/[id]/screening/answer.post.ts',
      'server/api/applications/[id]/screening/complete.post.ts',
      'server/api/applications/[id]/screening/generate.post.ts',
      'server/api/applications/[id]/screening/interpret.post.ts',
    ]
    for (const path of paths) expect(readSource(path)).toContain('assertApplicationAccess')
  })
})