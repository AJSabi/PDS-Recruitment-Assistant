import { and, eq } from 'drizzle-orm'
import { recruitmentApplicationProfile, recruitmentEvidence, recruiterScreeningSession } from '../../../../database/schema'
import { syncApplicationStatusForRecruitmentStage } from '../../../../utils/recruitmentApplicationStatus'
import { assertApplicationAccess } from '../../../../utils/recruitmentVisibility'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })
const bodySchema = z.object({
  reason: z.enum(['role', 'compensation', 'location', 'timing', 'other']),
  note: z.string().trim().max(2000).nullish(),
}).strict().superRefine((data, ctx) => {
  if (data.reason === 'other' && !data.note?.trim()) {
    ctx.addIssue({ code: 'custom', message: 'Add a short note when Other is selected.', path: ['note'] })
  }
})

const reasonLabels: Record<string, string> = {
  role: 'Not interested in the role',
  compensation: 'Compensation not suitable',
  location: 'Location not suitable',
  timing: 'Timing / availability not suitable',
  other: 'Other reason',
}

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { id: applicationId } = await getValidatedRouterParams(event, paramsSchema.parse)
  await assertApplicationAccess(orgId, session.user.id, applicationId)
  const body = await readValidatedBody(event, bodySchema.parse)

  const profile = await db.query.recruitmentApplicationProfile.findFirst({
    where: and(
      eq(recruitmentApplicationProfile.applicationId, applicationId),
      eq(recruitmentApplicationProfile.organizationId, orgId),
    ),
  })
  if (!profile) throw createError({ statusCode: 404, statusMessage: 'Recruitment profile not found' })

  if (!['resume_reviewed', 'recruiter_screening_pending'].includes(profile.lastStatus)) {
    throw createError({ statusCode: 422, statusMessage: 'Candidate Not Interested can be recorded only before or during Recruiter Screening.' })
  }

  const now = new Date()
  const reasonLabel = reasonLabels[body.reason]
  const summary = body.note?.trim() ? `Candidate Not Interested — ${reasonLabel}. ${body.note.trim()}` : `Candidate Not Interested — ${reasonLabel}`

  const screening = await db.query.recruiterScreeningSession.findFirst({
    where: and(
      eq(recruiterScreeningSession.applicationId, applicationId),
      eq(recruiterScreeningSession.organizationId, orgId),
    ),
  })
  if (screening && screening.status !== 'completed') {
    await db.update(recruiterScreeningSession).set({
      status: 'completed',
      completedAt: now,
      updatedAt: now,
    }).where(eq(recruiterScreeningSession.id, screening.id))
  }

  const [updated] = await db.update(recruitmentApplicationProfile).set({
    lastStatus: 'not_proceeding',
    statusDate: now,
    conversationBrief: summary,
    nextAction: 'Candidate Not Interested — Reassess or close application',
    lastContactAt: now,
    aiSummaryStale: true,
    lastUpdatedBy: session.user.id,
    updatedAt: now,
  }).where(eq(recruitmentApplicationProfile.id, profile.id)).returning()

  await syncApplicationStatusForRecruitmentStage(orgId, applicationId, 'not_proceeding')
  await db.insert(recruitmentEvidence).values({
    organizationId: orgId,
    applicationId,
    type: 'stage_change',
    summary,
    payload: {
      event: 'candidate_not_interested',
      from: profile.lastStatus,
      to: 'not_proceeding',
      reason: body.reason,
      candidateDecision: true,
      recruiterRejection: false,
    },
    createdBy: session.user.id,
  })

  return {
    profile: updated,
    outcome: 'candidate_not_interested',
    reason: body.reason,
    message: 'Candidate marked Not Interested. Candidate remains in the central Candidate Database and can be reconsidered later through Reassess.',
  }
})
