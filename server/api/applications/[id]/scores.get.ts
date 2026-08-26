import { eq, and, desc } from 'drizzle-orm'
import { criterionScore, analysisRun, scoringCriterion } from '../../../database/schema'
import { assertApplicationAccess } from '../../../utils/recruitmentVisibility'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { scoring: ['read'] })
  const orgId = session.session.activeOrganizationId
  const { id: applicationId } = await getValidatedRouterParams(event, paramsSchema.parse)
  const app = await assertApplicationAccess(orgId, session.user.id, applicationId)

  const rawScores = await db.select({
    criterionKey: criterionScore.criterionKey,
    maxScore: criterionScore.maxScore,
    score: criterionScore.applicantScore,
    confidence: criterionScore.confidence,
    evidence: criterionScore.evidence,
    strengths: criterionScore.strengths,
    gaps: criterionScore.gaps,
    criterionName: scoringCriterion.name,
    weight: scoringCriterion.weight,
    category: scoringCriterion.category,
  })
    .from(criterionScore)
    .leftJoin(scoringCriterion, and(eq(scoringCriterion.jobId, app.jobId), eq(scoringCriterion.key, criterionScore.criterionKey)))
    .where(and(eq(criterionScore.applicationId, applicationId), eq(criterionScore.organizationId, orgId)))

  const [latestRun] = await db.select({
    id: analysisRun.id,
    status: analysisRun.status,
    provider: analysisRun.provider,
    model: analysisRun.model,
    compositeScore: analysisRun.compositeScore,
    promptTokens: analysisRun.promptTokens,
    completionTokens: analysisRun.completionTokens,
    createdAt: analysisRun.createdAt,
  })
    .from(analysisRun)
    .where(and(eq(analysisRun.applicationId, applicationId), eq(analysisRun.organizationId, orgId)))
    .orderBy(desc(analysisRun.createdAt))
    .limit(1)

  return { compositeScore: null, scores: rawScores, latestRun: latestRun ?? null }
})
