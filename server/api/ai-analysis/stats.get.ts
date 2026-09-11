import { eq, and, desc, sql, count, sum } from 'drizzle-orm'
import { analysisRun, job, application, candidate, aiConfig } from '../../database/schema'
import { assertRecruitmentAdmin } from '../../utils/recruitmentVisibility'

/**
 * Organization-wide AI usage/cost reporting is restricted to recruitment
 * administrators. Recruiters receive AI results only inside requirements
 * allocated to them.
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { scoring: ['read'] })
  const orgId = session.session.activeOrganizationId
  await assertRecruitmentAdmin(orgId, session.user.id)

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const thirtyDaysAgoISO = thirtyDaysAgo.toISOString()

  const pricingConfigs = await db.query.aiConfig.findMany({
    where: eq(aiConfig.organizationId, orgId),
    columns: {
      provider: true,
      model: true,
      inputPricePer1m: true,
      outputPricePer1m: true,
      isDefaultAnalysis: true,
    },
  })

  const pricingByModel = new Map<string, { inputPricePer1m: number | null, outputPricePer1m: number | null }>()
  for (const c of pricingConfigs) {
    pricingByModel.set(`${c.provider}::${c.model}`, {
      inputPricePer1m: c.inputPricePer1m != null ? Number(c.inputPricePer1m) : null,
      outputPricePer1m: c.outputPricePer1m != null ? Number(c.outputPricePer1m) : null,
    })
  }
  const defaultAnalysisConfig = pricingConfigs.find(c => c.isDefaultAnalysis) ?? pricingConfigs[0] ?? null

  const [totalRuns, completedRuns, failedRuns, tokenUsage, dailyRuns, recentRuns, modelBreakdown] = await Promise.all([
    db.$count(analysisRun, eq(analysisRun.organizationId, orgId)),
    db.$count(analysisRun, and(eq(analysisRun.organizationId, orgId), eq(analysisRun.status, 'completed'))),
    db.$count(analysisRun, and(eq(analysisRun.organizationId, orgId), eq(analysisRun.status, 'failed'))),
    db.select({
      totalPromptTokens: sum(analysisRun.promptTokens).as('total_prompt_tokens'),
      totalCompletionTokens: sum(analysisRun.completionTokens).as('total_completion_tokens'),
    }).from(analysisRun).where(eq(analysisRun.organizationId, orgId)),
    db.select({
      date: sql<string>`DATE(${analysisRun.createdAt})`.as('date'),
      count: count().as('count'),
      promptTokens: sum(analysisRun.promptTokens).as('prompt_tokens'),
      completionTokens: sum(analysisRun.completionTokens).as('completion_tokens'),
    }).from(analysisRun)
      .where(and(eq(analysisRun.organizationId, orgId), sql`${analysisRun.createdAt} >= ${thirtyDaysAgoISO}`))
      .groupBy(sql`DATE(${analysisRun.createdAt})`)
      .orderBy(sql`DATE(${analysisRun.createdAt})`),
    db.select({
      id: analysisRun.id,
      status: analysisRun.status,
      provider: analysisRun.provider,
      model: analysisRun.model,
      compositeScore: analysisRun.compositeScore,
      promptTokens: analysisRun.promptTokens,
      completionTokens: analysisRun.completionTokens,
      createdAt: analysisRun.createdAt,
      candidateFirstName: candidate.firstName,
      candidateLastName: candidate.lastName,
      jobTitle: job.title,
    }).from(analysisRun)
      .innerJoin(application, eq(application.id, analysisRun.applicationId))
      .innerJoin(candidate, eq(candidate.id, application.candidateId))
      .innerJoin(job, eq(job.id, application.jobId))
      .where(eq(analysisRun.organizationId, orgId))
      .orderBy(desc(analysisRun.createdAt))
      .limit(20),
    db.select({
      provider: analysisRun.provider,
      model: analysisRun.model,
      runCount: count().as('run_count'),
      totalPromptTokens: sum(analysisRun.promptTokens).as('total_prompt_tokens'),
      totalCompletionTokens: sum(analysisRun.completionTokens).as('total_completion_tokens'),
    }).from(analysisRun)
      .where(eq(analysisRun.organizationId, orgId))
      .groupBy(analysisRun.provider, analysisRun.model),
  ])

  const usage = tokenUsage[0]
  const inputPrice = defaultAnalysisConfig?.inputPricePer1m != null ? Number(defaultAnalysisConfig.inputPricePer1m) : null
  const outputPrice = defaultAnalysisConfig?.outputPricePer1m != null ? Number(defaultAnalysisConfig.outputPricePer1m) : null

  return {
    pricing: {
      inputPricePer1m: inputPrice,
      outputPricePer1m: outputPrice,
      configured: inputPrice != null || outputPrice != null,
    },
    summary: {
      totalRuns: Number(totalRuns),
      completedRuns: Number(completedRuns),
      failedRuns: Number(failedRuns),
      totalPromptTokens: Number(usage?.totalPromptTokens ?? 0),
      totalCompletionTokens: Number(usage?.totalCompletionTokens ?? 0),
      totalTokens: Number(usage?.totalPromptTokens ?? 0) + Number(usage?.totalCompletionTokens ?? 0),
    },
    dailyRuns: dailyRuns.map(d => ({
      date: d.date,
      count: Number(d.count),
      promptTokens: Number(d.promptTokens ?? 0),
      completionTokens: Number(d.completionTokens ?? 0),
    })),
    recentRuns: recentRuns.map(r => ({
      id: r.id,
      status: r.status,
      provider: r.provider,
      model: r.model,
      compositeScore: r.compositeScore,
      promptTokens: r.promptTokens,
      completionTokens: r.completionTokens,
      createdAt: r.createdAt,
      candidateName: `${r.candidateFirstName} ${r.candidateLastName}`,
      jobTitle: r.jobTitle,
    })),
    modelBreakdown: modelBreakdown.map((m) => {
      const price = pricingByModel.get(`${m.provider}::${m.model}`)
      const promptTokens = Number(m.totalPromptTokens ?? 0)
      const completionTokens = Number(m.totalCompletionTokens ?? 0)
      return {
        provider: m.provider,
        model: m.model,
        runCount: Number(m.runCount),
        totalPromptTokens: promptTokens,
        totalCompletionTokens: completionTokens,
        totalTokens: promptTokens + completionTokens,
        inputPricePer1m: price?.inputPricePer1m ?? null,
        outputPricePer1m: price?.outputPricePer1m ?? null,
      }
    }),
  }
})
