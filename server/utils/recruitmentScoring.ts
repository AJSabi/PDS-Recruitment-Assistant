export type RankingPriority = 'P1' | 'P2' | 'P3' | 'P4'

export function calculateProvisionalFit(input: {
  mandatoryScore?: number | null
  preferredScore?: number | null
  experienceScore?: number | null
  optionalScore?: number | null
}) {
  const mandatory = input.mandatoryScore ?? 0
  const preferred = input.preferredScore ?? 0
  const experience = input.experienceScore ?? 0
  const optional = input.optionalScore ?? 0

  const score = Math.round(
    mandatory * 0.60
    + preferred * 0.20
    + experience * 0.15
    + optional * 0.05,
  )

  let priority: RankingPriority
  if (score >= 80 && mandatory >= 80) priority = 'P1'
  else if (score >= 65 && mandatory >= 60) priority = 'P2'
  else if (score >= 45) priority = 'P3'
  else priority = 'P4'

  // Critical Mandatory weakness always overrides an otherwise high weighted score.
  if (mandatory < 40) priority = 'P4'
  else if (mandatory < 60 && (priority === 'P1' || priority === 'P2')) priority = 'P3'

  return { score: Math.max(0, Math.min(100, score)), priority }
}
