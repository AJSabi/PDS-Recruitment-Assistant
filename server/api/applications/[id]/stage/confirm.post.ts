import { and, eq } from 'drizzle-orm'
import {
  application,
  recruitmentApplicationProfile,
  recruitmentEvidence,
  recruiterScreeningSession,
  resumeAssessment,
} from '../../../../database/schema'
import { confirmRecruitmentStageSchema, CONFIRMED_STAGE_TRANSITIONS } from '../../../../utils/schemas/recruitmentStage'
import { coarseStatusForRecruitmentStage } from '../../../../utils/recruitmentApplicationStatus'
import { assertApplicationAccess } from '../../../../utils/recruitmentVisibility'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })

const defaultNextActionByStage: Record<string, string> = {
  recruiter_screening_completed: 'Proceed to Hiring Manager Round',
  hiring_manager_round_pending: 'Complete Hiring Manager Round externally, then mark it completed',
  hiring_manager_round_completed: 'Move to HOD Round',
  hod_round_pending: 'Complete HOD Round externally, then mark it completed',
  hod_round_completed: 'Move to HR Round',
  hr_round_pending: 'Complete HR Round externally, then mark it completed',
  hr_round_completed: 'Move to Offer Stage',
  reassess: 'Review new evidence and reassess candidate',
  not_proceeding: 'Reassess or close application',
  offer_stage: 'Record Offer Accepted or Offer Declined',
  offer_accepted: 'Confirm Joined after actual joining',
  offer_declined: 'Reassess or close application',
  joined: 'Close application when recruitment administration is complete',
  closed: 'No further action',
}

const holdResumeActionBySource: Record<string, { stage: string; action: string }> = {
  recruiter_screening_pending: { stage: 'recruiter_screening_pending', action: 'Resume Recruiter Screening' },
  recruiter_screening_completed: { stage: 'hiring_manager_round_pending', action: 'Resume Hiring Manager Round' },
  hiring_manager_round_pending: { stage: 'hiring_manager_round_pending', action: 'Resume Hiring Manager Round' },
  hiring_manager_round_completed: { stage: 'hod_round_pending', action: 'Resume HOD Round' },
  hod_round_pending: { stage: 'hod_round_pending', action: 'Resume HOD Round' },
  hod_round_completed: { stage: 'hr_round_pending', action: 'Resume HR Round' },
  hr_round_pending: { stage: 'hr_round_pending', action: 'Resume HR Round' },
  hr_round_completed: { stage: 'offer_stage', action: 'Resume Offer Stage' },
  offer_stage: { stage: 'offer_stage', action: 'Resume Offer Stage' },
}

const holdResumeStageByAction = new Map(Object.values(holdResumeActionBySource).map(item => [item.action, item.stage]))
const stagesRequiringDecisionNote = new Set(['hold_for_comparison', 'not_proceeding', 'offer_declined'])

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { id: applicationId } = await getValidatedRouterParams(event, paramsSchema.parse)
  await assertApplicationAccess(orgId, session.user.id, applicationId)
  const body = await readValidatedBody(event, confirmRecruitmentStageSchema.parse)

  const app = await db.query.application.findFirst({
    where: and(eq(application.id, applicationId), eq(application.organizationId, orgId)),
    columns: { id: true },
  })
  if (!app) throw createError({ statusCode: 404, statusMessage: 'Application not found' })

  const profile = await db.query.recruitmentApplicationProfile.findFirst({
    where: and(eq(recruitmentApplicationProfile.applicationId, applicationId), eq(recruitmentApplicationProfile.organizationId, orgId)),
  })
  if (!profile) throw createError({ statusCode: 404, statusMessage: 'Recruitment profile not found' })
  if (body.stage === profile.lastStatus) return { profile, changed: false }

  const allowed = CONFIRMED_STAGE_TRANSITIONS[profile.lastStatus] ?? []
  if (!allowed.includes(body.stage)) throw createError({ statusCode: 422, statusMessage: `Cannot confirm stage change from ${profile.lastStatus} to ${body.stage}.` })

  if (profile.lastStatus === 'hold_for_comparison' && !['reassess', 'not_proceeding', 'closed'].includes(body.stage)) {
    const expectedResumeStage = holdResumeStageByAction.get(profile.nextAction ?? '')
    if (!expectedResumeStage) throw createError({ statusCode: 422, statusMessage: 'This hold record does not contain a safe resume stage. Choose Reassess or Not Proceeding instead.' })
    if (body.stage !== expectedResumeStage) throw createError({ statusCode: 422, statusMessage: `Resume this held candidate through ${profile.nextAction}.` })
  }

  if (stagesRequiringDecisionNote.has(body.stage) && !body.note?.trim()) {
    throw createError({ statusCode: 422, statusMessage: 'Add a short decision comment before recording this stage.' })
  }

  if (body.stage === 'resume_received' && !profile.selectedResumeDocumentId) throw createError({ statusCode: 422, statusMessage: 'Select the resume for this application first. Resume Received is set automatically when a resume is selected.' })

  if (body.stage === 'resume_reviewed') {
    const assessment = await db.query.resumeAssessment.findFirst({ where: and(eq(resumeAssessment.applicationId, applicationId), eq(resumeAssessment.organizationId, orgId)), columns: { id: true } })
    if (!assessment) throw createError({ statusCode: 422, statusMessage: 'Complete and save the Resume Assessment first. Resume Reviewed is set automatically by that action.' })
  }

  if (body.stage === 'recruiter_screening_pending' || body.stage === 'recruiter_screening_completed') {
    const screening = await db.query.recruiterScreeningSession.findFirst({ where: and(eq(recruiterScreeningSession.applicationId, applicationId), eq(recruiterScreeningSession.organizationId, orgId)), columns: { status: true } })
    const requiredStatus = body.stage === 'recruiter_screening_pending' ? 'in_progress' : 'completed'
    if (!screening || screening.status !== requiredStatus) throw createError({ statusCode: 422, statusMessage: body.stage === 'recruiter_screening_pending' ? 'Start Recruiter Screening first. Screening Pending is set automatically when screening starts.' : 'Complete Recruiter Screening first. Screening Completed is set automatically after the final screening assessment.' })
  }

  const holdResume = body.stage === 'hold_for_comparison' ? holdResumeActionBySource[profile.lastStatus] : null
  if (body.stage === 'hold_for_comparison' && !holdResume) throw createError({ statusCode: 422, statusMessage: `Hold for Comparison is not supported from ${profile.lastStatus}.` })

  // Hiring Manager, HOD and HR discussions happen outside the application in V1.
  // The recruiter manually confirms each sequential stage here. A note is optional for normal
  // progression and required only for governed exception/outcome decisions.
  const now = new Date()
  const coarseStatus = coarseStatusForRecruitmentStage(body.stage)
  const updated = await db.transaction(async (tx) => {
    const [profileUpdated] = await tx.update(recruitmentApplicationProfile).set({
      lastStatus: body.stage,
      statusDate: now,
      nextAction: holdResume?.action ?? body.nextAction ?? defaultNextActionByStage[body.stage] ?? profile.nextAction,
      lastContactAt: body.contactOccurred ? now : profile.lastContactAt,
      aiSummaryStale: true,
      lastUpdatedBy: session.user.id,
      updatedAt: now,
    }).where(and(
      eq(recruitmentApplicationProfile.id, profile.id),
      eq(recruitmentApplicationProfile.organizationId, orgId),
    )).returning()

    if (!profileUpdated) throw createError({ statusCode: 409, statusMessage: 'Recruitment profile changed before this stage could be confirmed. Refresh and try again.' })

    if (coarseStatus) {
      const [applicationUpdated] = await tx.update(application)
        .set({ status: coarseStatus, updatedAt: now })
        .where(and(eq(application.id, applicationId), eq(application.organizationId, orgId)))
        .returning({ id: application.id })
      if (!applicationUpdated) throw createError({ statusCode: 409, statusMessage: 'Application changed before this stage could be confirmed. Refresh and try again.' })
    }

    await tx.insert(recruitmentEvidence).values({
      organizationId: orgId,
      applicationId,
      type: 'stage_change',
      summary: body.note ?? `Recruiter manually confirmed recruitment stage: ${body.stage}`,
      payload: { event: 'stage_confirmed', from: profile.lastStatus, to: body.stage, manualStageMovement: true, ...(holdResume ? { holdResumeStage: holdResume.stage } : {}) },
      createdBy: session.user.id,
    })

    return profileUpdated
  })

  return { profile: updated, changed: true }
})
