import { and, desc, eq, gte, isNull } from 'drizzle-orm'
import { application, candidate, recruitmentRequirementState, talentPoolMatch } from '../../../../database/schema'
import { assertRequirementAccess } from '../../../../utils/recruitmentVisibility'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })
const FINAL_POOL_THRESHOLD = 50

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['read'] })
  const orgId = session.session.activeOrganizationId
  const { id: jobId } = await getValidatedRouterParams(event, paramsSchema.parse)
  await assertRequirementAccess(orgId, session.user.id, jobId)

  const requirementState = await db.query.recruitmentRequirementState.findFirst({
    where: and(
      eq(recruitmentRequirementState.organizationId, orgId),
      eq(recruitmentRequirementState.jobId, jobId),
    ),
    columns: { revision: true, skillMatrixApproved: true },
  })

  if (!requirementState?.skillMatrixApproved) {
    return {
      jobId,
      threshold: FINAL_POOL_THRESHOLD,
      total: 0,
      ranking: [],
      available: false,
      reason: 'Approve the current Skill Matrix to generate the AI Candidate Pool.',
    }
  }

  const rows = await db.select({
    matchId: talentPoolMatch.id,
    candidateId: talentPoolMatch.candidateId,
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    email: candidate.email,
    phone: candidate.phone,
    score: talentPoolMatch.score,
    priority: talentPoolMatch.priority,
    mandatoryMatch: talentPoolMatch.mandatoryMatch,
    keyStrength: talentPoolMatch.keyStrength,
    mainGap: talentPoolMatch.mainGap,
    candidateSnapshot: talentPoolMatch.candidateSnapshot,
    jdAlignment: talentPoolMatch.jdAlignment,
    source: talentPoolMatch.source,
    promotedApplicationId: talentPoolMatch.promotedApplicationId,
    resumeDocumentId: talentPoolMatch.resumeDocumentId,
    requirementVersion: talentPoolMatch.requirementVersion,
    assessedAt: talentPoolMatch.assessedAt,
  }).from(talentPoolMatch)
    .innerJoin(candidate, eq(candidate.id, talentPoolMatch.candidateId))
    .leftJoin(application, and(
      eq(application.organizationId, orgId),
      eq(application.jobId, jobId),
      eq(application.candidateId, talentPoolMatch.candidateId),
    ))
    .where(and(
      eq(talentPoolMatch.organizationId, orgId),
      eq(talentPoolMatch.jobId, jobId),
      eq(talentPoolMatch.requirementVersion, requirementState.revision),
      gte(talentPoolMatch.score, FINAL_POOL_THRESHOLD),
      isNull(talentPoolMatch.promotedApplicationId),
      isNull(application.id),
    ))
    .orderBy(desc(talentPoolMatch.score), desc(talentPoolMatch.assessedAt))

  return {
    jobId,
    threshold: FINAL_POOL_THRESHOLD,
    total: rows.length,
    ranking: rows.map((row, index) => ({ rank: index + 1, ...row })),
    available: true,
  }
})
