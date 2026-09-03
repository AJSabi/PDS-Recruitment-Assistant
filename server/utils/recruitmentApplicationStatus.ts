import { and, eq } from 'drizzle-orm'
import { application } from '../database/schema'
import type { RecruitmentStage } from '../database/schema/recruitmentWorkflow'

type ApplicationStatus = 'new' | 'screening' | 'interview' | 'offer' | 'hired' | 'rejected'

export function coarseStatusForRecruitmentStage(stage: RecruitmentStage): ApplicationStatus | null {
  switch (stage) {
    case 'candidate_added':
    case 'resume_received':
    case 'resume_reviewed':
      return 'new'
    case 'recruiter_screening_pending':
    case 'recruiter_screening_completed':
    case 'hold_for_comparison':
    case 'reassess':
      return 'screening'
    case 'hiring_manager_round_pending':
    case 'hiring_manager_round_completed':
    case 'hod_round_pending':
    case 'hod_round_completed':
    case 'hr_round_pending':
    case 'hr_round_completed':
      return 'interview'
    case 'offer_stage':
    case 'offer_accepted':
    case 'offer_declined':
      return 'offer'
    case 'joined':
      return 'hired'
    case 'not_proceeding':
      return 'rejected'
    case 'closed':
      return null
  }
}

/**
 * Keeps legacy Reqcore views usable without making their coarse status model authoritative.
 * Detailed PDS stage validation must happen before this helper is called.
 */
export async function syncApplicationStatusForRecruitmentStage(
  organizationId: string,
  applicationId: string,
  stage: RecruitmentStage,
) {
  const target = coarseStatusForRecruitmentStage(stage)
  if (!target) return null

  const [updated] = await db.update(application)
    .set({ status: target, updatedAt: new Date() })
    .where(and(eq(application.id, applicationId), eq(application.organizationId, organizationId)))
    .returning({ id: application.id, status: application.status })

  return updated ?? null
}
