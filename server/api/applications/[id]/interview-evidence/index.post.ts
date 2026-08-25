import { and, eq } from 'drizzle-orm'
import { application, recruitmentApplicationProfile, recruitmentEvidence, recruitmentRequirementState } from '../../../../database/schema'
import { interviewEvidenceSchema } from '../../../../utils/schemas/recruitmentStage'
import { refreshRequirementReassessmentFlag } from '../../../../utils/recruitmentLifecycle'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })
const allowedInterviewStatuses = new Set([
  'hiring_manager_round_pending',
  'hiring_manager_round_completed',
  'hod_round_pending',
  'hod_round_completed',
  'hr_round_pending',
  'hr_round_completed',
  'reassess',
])
const recommendationLabels: Record<string, string> = {
  proceed: 'Proceed',
  hold: 'Hold for Comparison',
  reassess: 'Reassess',
  not_proceeding: 'Recruiter Decision Required',
  offer: 'Consider Offer Stage',
}

function evidenceTypeForInterview(interviewType: 'hiring_manager' | 'hod' | 'hr' | 'interview') {
  if (interviewType === 'hiring_manager') return 'hiring_manager_interview' as const
  if (interviewType === 'hod') return 'hod_interview' as const
  if (interviewType === 'hr') return 'hr_interview' as const
  return 'interview' as const
}

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { id: applicationId } = await getValidatedRouterParams(event, paramsSchema.parse)
  const body = await readValidatedBody(event, interviewEvidenceSchema.parse)

  const app = await db.query.application.findFirst({
    where: and(eq(application.id, applicationId), eq(application.organizationId, orgId)),
    columns: { id: true, jobId: true },
  })
  if (!app) throw createError({ statusCode: 404, statusMessage: 'Application not found' })

  const profile = await db.query.recruitmentApplicationProfile.findFirst({
    where: and(eq(recruitmentApplicationProfile.applicationId, applicationId), eq(recruitmentApplicationProfile.organizationId, orgId)),
  })
  if (!profile) throw createError({ statusCode: 404, statusMessage: 'Recruitment profile not found' })
  if (!allowedInterviewStatuses.has(profile.lastStatus)) {
    throw createError({ statusCode: 422, statusMessage: `Interview evidence cannot be recorded while candidate status is ${profile.lastStatus}.` })
  }

  const requirementState = await db.query.recruitmentRequirementState.findFirst({
    where: and(eq(recruitmentRequirementState.jobId, app.jobId), eq(recruitmentRequirementState.organizationId, orgId)),
  })
  const requirementRevision = requirementState?.revision ?? profile.requirementVersionAssessed

  const [evidence] = await db.insert(recruitmentEvidence).values({
    organizationId: orgId,
    applicationId,
    type: evidenceTypeForInterview(body.interviewType),
    summary: body.summary,
    payload: {
      interviewType: body.interviewType,
      strengths: body.strengths,
      concerns: body.concerns,
      validationFocus: body.validationFocus,
      recommendation: body.recommendation ?? null,
      fit: body.fit ?? null,
      updateCurrentFit: body.updateCurrentFit,
      requirementRevision,
    },
    createdBy: session.user.id,
  }).returning()

  const now = new Date()
  const updates: Record<string, unknown> = {
    conversationBrief: body.summary,
    lastContactAt: now,
    nextAction: body.recommendation ? recommendationLabels[body.recommendation] : profile.nextAction,
    lastUpdatedBy: session.user.id,
    updatedAt: now,
  }

  if (body.updateCurrentFit && body.fit) {
    updates.currentFit = body.fit
    updates.assessmentLocked = true
    updates.requirementVersionAssessed = requirementRevision
  }

  const [updatedProfile] = await db.update(recruitmentApplicationProfile)
    .set(updates)
    .where(eq(recruitmentApplicationProfile.id, profile.id))
    .returning()

  if (body.updateCurrentFit && body.fit) await refreshRequirementReassessmentFlag(orgId, app.jobId)

  return {
    evidence,
    profile: updatedProfile,
    recommendation: body.recommendation ?? null,
    statusChanged: false,
    requirementRevision,
  }
})
