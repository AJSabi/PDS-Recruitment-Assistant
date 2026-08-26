import { and, eq } from 'drizzle-orm'
import { recruitmentApplicationProfile, resumeAssessment } from '../../../../database/schema'
import { assertApplicationAccess } from '../../../../utils/recruitmentVisibility'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['read'] })
  const orgId = session.session.activeOrganizationId
  const { id: applicationId } = await getValidatedRouterParams(event, paramsSchema.parse)
  await assertApplicationAccess(orgId, session.user.id, applicationId)

  const [profile, assessment] = await Promise.all([
    db.query.recruitmentApplicationProfile.findFirst({
      where: and(
        eq(recruitmentApplicationProfile.organizationId, orgId),
        eq(recruitmentApplicationProfile.applicationId, applicationId),
      ),
    }),
    db.query.resumeAssessment.findFirst({
      where: and(eq(resumeAssessment.organizationId, orgId), eq(resumeAssessment.applicationId, applicationId)),
      columns: { candidateSnapshot: true, jdAlignment: true, assessedAt: true },
    }),
  ])

  if (!profile) throw createError({ statusCode: 404, statusMessage: 'Recruitment profile not found' })

  return {
    applicationId,
    finalStatus: profile.lastStatus,
    currentFit: profile.currentFit,
    candidateSummary: profile.aiCandidateSummary ?? assessment?.candidateSnapshot ?? profile.resumeBrief ?? null,
    overallAssessment: profile.aiOverallAssessment ?? assessment?.jdAlignment ?? null,
    interviewBriefs: profile.aiInterviewBriefs ?? [],
    finalBrief: profile.aiFinalBrief ?? null,
    evidenceConfidence: profile.aiEvidenceConfidence ?? (assessment ? 'limited' : null),
    stale: profile.aiSummaryStale,
    generated: Boolean(profile.aiSummaryUpdatedAt),
    updatedAt: profile.aiSummaryUpdatedAt ?? assessment?.assessedAt ?? null,
  }
})
