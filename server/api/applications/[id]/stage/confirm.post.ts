import { and, eq } from 'drizzle-orm'
import {
  application,
  recruitmentApplicationProfile,
  recruitmentEvidence,
  recruiterScreeningSession,
  resumeAssessment,
} from '../../../../database/schema'
import { confirmRecruitmentStageSchema, CONFIRMED_STAGE_TRANSITIONS } from '../../../../utils/schemas/recruitmentStage'
import { syncApplicationStatusForRecruitmentStage } from '../../../../utils/recruitmentApplicationStatus'
import { assertApplicationAccess } from '../../../../utils/recruitmentVisibility'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })

const requiredEvidenceForCompletedStage: Record<string, 'hiring_manager_interview' | 'hod_interview' | 'hr_interview'> = {
  hiring_manager_round_completed: 'hiring_manager_interview',
  hod_round_completed: 'hod_interview',
  hr_round_completed: 'hr_interview',
}

const completedStageLabels: Record<string, string> = {
  hiring_manager_round_completed: 'Hiring Manager',
  hod_round_completed: 'HOD',
  hr_round_completed: 'HR',
}

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

  const requiredEvidenceType = requiredEvidenceForCompletedStage[body.stage]
  if (requiredEvidenceType) {
    const interviewEvidence = await db.query.recruitmentEvidence.findFirst({
      where: and(
        eq(recruitmentEvidence.organizationId, orgId),
        eq(recruitmentEvidence.applicationId, applicationId),
        eq(recruitmentEvidence.type, requiredEvidenceType),
      ),
      columns: { id: true },
    })
    if (!interviewEvidence) {
      const roundLabel = completedStageLabels[body.stage] ?? 'Interview'
      throw createError({ statusCode: 422, statusMessage: `Record ${roundLabel} interview evidence before marking this round completed.` })
    }
  }

  const now = new Date()
  const [updated] = await db.update(recruitmentApplicationProfile).set({
    lastStatus: body.stage,
    statusDate: now,
    nextAction: body.nextAction ?? profile.nextAction,
    lastContactAt: body.contactOccurred ? now : profile.lastContactAt,
    aiSummaryStale: true,
    lastUpdatedBy: session.user.id,
    updatedAt: now,
  }).where(eq(recruitmentApplicationProfile.id, profile.id)).returning()

  await syncApplicationStatusForRecruitmentStage(orgId, applicationId, body.stage)
  await db.insert(recruitmentEvidence).values({ organizationId: orgId, applicationId, type: 'stage_change', summary: body.note ?? `Confirmed recruitment stage: ${body.stage}`, payload: { event: 'stage_confirmed', from: profile.lastStatus, to: body.stage }, createdBy: session.user.id })

  return { profile: updated, changed: true }
})
