import { recruitmentEvidence } from '../database/schema'
import type { RecruitmentStage } from '../database/schema/recruitmentWorkflow'

type StageChangeSource = 'manual_confirmation' | 'resume_selection' | 'resume_assessment' | 'screening_start' | 'screening_completion'

export async function recordRecruitmentStageChange(input: {
  organizationId: string
  applicationId: string
  from: RecruitmentStage
  to: RecruitmentStage
  actorId?: string | null
  source: StageChangeSource
  summary?: string | null
  metadata?: Record<string, unknown>
}) {
  if (input.from === input.to) return null

  const [event] = await db.insert(recruitmentEvidence).values({
    organizationId: input.organizationId,
    applicationId: input.applicationId,
    type: 'stage_change',
    summary: input.summary?.trim() || `Recruitment stage changed from ${input.from} to ${input.to}`,
    payload: {
      event: 'stage_changed',
      from: input.from,
      to: input.to,
      source: input.source,
      ...(input.metadata ?? {}),
    },
    createdBy: input.actorId ?? null,
  }).returning()

  return event ?? null
}
