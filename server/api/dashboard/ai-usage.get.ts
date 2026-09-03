import { and, eq, gte } from 'drizzle-orm'
import { aiConfig, analysisRun } from '../../database/schema'
import { assertRecruitmentAdmin } from '../../utils/recruitmentVisibility'

function numeric(value: string | number | null | undefined) {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function configuredCostUsd(promptTokens: number, completionTokens: number, inputPrice: number, outputPrice: number) {
  return Math.round((((promptTokens / 1_000_000) * inputPrice) + ((completionTokens / 1_000_000) * outputPrice)) * 1_000_000) / 1_000_000
}

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['read'] })
  const orgId = session.session.activeOrganizationId
  await assertRecruitmentAdmin(orgId, session.user.id)

  const periodStart = new Date(Date.now() - 30 * 86400000)
  const [runs, configs] = await Promise.all([
    db.select({
      id: analysisRun.id,
      provider: analysisRun.provider,
      model: analysisRun.model,
      status: analysisRun.status,
      promptTokens: analysisRun.promptTokens,
      completionTokens: analysisRun.completionTokens,
      createdAt: analysisRun.createdAt,
    })
      .from(analysisRun)
      .where(and(
        eq(analysisRun.organizationId, orgId),
        gte(analysisRun.createdAt, periodStart),
      )),
    db.select({
      provider: aiConfig.provider,
      model: aiConfig.model,
      inputPricePer1m: aiConfig.inputPricePer1m,
      outputPricePer1m: aiConfig.outputPricePer1m,
    })
      .from(aiConfig)
      .where(eq(aiConfig.organizationId, orgId)),
  ])

  const priceCandidates = new Map<string, Array<{ input: number; output: number }>>()
  for (const config of configs) {
    const input = numeric(config.inputPricePer1m)
    const output = numeric(config.outputPricePer1m)
    if (input == null || output == null) continue
    const key = `${config.provider}::${config.model}`
    const list = priceCandidates.get(key) ?? []
    list.push({ input, output })
    priceCandidates.set(key, list)
  }

  const resolvedPrice = new Map<string, { input: number; output: number }>()
  for (const [key, prices] of priceCandidates) {
    const unique = new Map(prices.map(price => [`${price.input}:${price.output}`, price]))
    if (unique.size === 1) resolvedPrice.set(key, [...unique.values()][0]!)
  }

  const modelMap = new Map<string, {
    provider: string
    model: string
    runs: number
    successfulRuns: number
    failedRuns: number
    promptTokens: number
    completionTokens: number
    pricedRuns: number
    unpricedRuns: number
    configuredCostUsd: number
  }>()

  for (const run of runs) {
    const key = `${run.provider}::${run.model}`
    const row = modelMap.get(key) ?? {
      provider: run.provider,
      model: run.model,
      runs: 0,
      successfulRuns: 0,
      failedRuns: 0,
      promptTokens: 0,
      completionTokens: 0,
      pricedRuns: 0,
      unpricedRuns: 0,
      configuredCostUsd: 0,
    }
    const promptTokens = run.promptTokens ?? 0
    const completionTokens = run.completionTokens ?? 0
    row.runs++
    if (run.status === 'completed') row.successfulRuns++
    else row.failedRuns++
    row.promptTokens += promptTokens
    row.completionTokens += completionTokens

    const price = resolvedPrice.get(key)
    if (price && run.promptTokens != null && run.completionTokens != null) {
      row.pricedRuns++
      row.configuredCostUsd += configuredCostUsd(promptTokens, completionTokens, price.input, price.output)
    } else {
      row.unpricedRuns++
    }
    modelMap.set(key, row)
  }

  const models = [...modelMap.values()]
    .map(row => ({
      ...row,
      totalTokens: row.promptTokens + row.completionTokens,
      configuredCostUsd: Math.round(row.configuredCostUsd * 1_000_000) / 1_000_000,
    }))
    .sort((a, b) => b.runs - a.runs || a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model))

  const summary = models.reduce((total, row) => ({
    runs: total.runs + row.runs,
    successfulRuns: total.successfulRuns + row.successfulRuns,
    failedRuns: total.failedRuns + row.failedRuns,
    promptTokens: total.promptTokens + row.promptTokens,
    completionTokens: total.completionTokens + row.completionTokens,
    totalTokens: total.totalTokens + row.totalTokens,
    pricedRuns: total.pricedRuns + row.pricedRuns,
    unpricedRuns: total.unpricedRuns + row.unpricedRuns,
    configuredCostUsd: total.configuredCostUsd + row.configuredCostUsd,
  }), {
    runs: 0,
    successfulRuns: 0,
    failedRuns: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    pricedRuns: 0,
    unpricedRuns: 0,
    configuredCostUsd: 0,
  })
  summary.configuredCostUsd = Math.round(summary.configuredCostUsd * 1_000_000) / 1_000_000

  return {
    generatedAt: new Date().toISOString(),
    period: {
      label: 'Last 30 days',
      startAt: periodStart.toISOString(),
      endAt: new Date().toISOString(),
    },
    summary,
    models,
    limitations: {
      cost: 'Configured cost uses persisted token usage multiplied by the organisation’s current unambiguous provider/model pricing. It is not a provider invoice and runs without reliable token or pricing data remain unpriced.',
      coverage: 'This view covers persisted analysis_run records. AI operations that do not create an analysis_run record are not included.',
    },
  }
})