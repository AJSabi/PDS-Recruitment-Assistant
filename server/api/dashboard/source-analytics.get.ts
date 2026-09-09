import { and, eq, gte, inArray } from 'drizzle-orm'
import { recruitmentApplicationProfile, recruitmentEvidence } from '../../database/schema'
import { getVisibleRequirementIds } from '../../utils/recruitmentVisibility'

const SOURCE_CATEGORIES = ['Naukri', 'Social Media', 'Referral', 'Database', 'Consultant', 'Others'] as const
type SourceCategory = typeof SOURCE_CATEGORIES[number]

function startDateForPeriod(period: number) {
  const value = new Date()
  value.setHours(0, 0, 0, 0)
  value.setDate(value.getDate() - (period - 1))
  return value
}

function normalizeSource(raw: unknown): SourceCategory {
  const value = String(raw ?? '').trim().toLowerCase()
  if (!value) return 'Others'
  if (value.includes('naukri')) return 'Naukri'
  if (['linkedin', 'facebook', 'instagram', 'social', 'social media'].some(token => value.includes(token))) return 'Social Media'
  if (value.includes('referral') || value.includes('employee refer')) return 'Referral'
  if (['database', 'talent pool', 'internal db', 'candidate db'].some(token => value.includes(token))) return 'Database'
  if (['consultant', 'consultancy', 'agency', 'vendor'].some(token => value.includes(token))) return 'Consultant'
  return 'Others'
}

function sourceFromEvidence(row: { payload: Record<string, unknown> | null; sourceRef: string | null }) {
  const payload = row.payload ?? {}
  return normalizeSource(
    payload.source
      ?? payload.sourceCategory
      ?? payload.sourceType
      ?? payload.channel
      ?? row.sourceRef,
  )
}

function stageReached(status: string | null, stages: string[]) {
  return !!status && stages.includes(status)
}

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { job: ['read'], candidate: ['read'], application: ['read'] })
  const orgId = session.session.activeOrganizationId
  const userId = session.user.id
  const query = getQuery(event)
  const requestedPeriod = Number(query.period ?? 90)
  const period = [30, 90, 365].includes(requestedPeriod) ? requestedPeriod : 90
  const startDate = startDateForPeriod(period)
  const visibleRequirementIds = await getVisibleRequirementIds(orgId, userId)

  if (visibleRequirementIds && visibleRequirementIds.length === 0) {
    return {
      period,
      categories: SOURCE_CATEGORIES.map(source => ({ source, candidates: 0, interviewed: 0, offered: 0, joined: 0, joinConversion: 0 })),
      note: 'Source analytics is limited to candidates in your visible recruitment scope.',
    }
  }

  const sourcingRows = await db.select({
    applicationId: recruitmentEvidence.applicationId,
    payload: recruitmentEvidence.payload,
    sourceRef: recruitmentEvidence.sourceRef,
    createdAt: recruitmentEvidence.createdAt,
  })
    .from(recruitmentEvidence)
    .where(and(
      eq(recruitmentEvidence.organizationId, orgId),
      eq(recruitmentEvidence.type, 'sourcing'),
      gte(recruitmentEvidence.createdAt, startDate),
      visibleRequirementIds ? inArray(recruitmentEvidence.jobId, visibleRequirementIds) : undefined,
    ))

  const sourceByApplication = new Map<string, SourceCategory>()
  for (const row of sourcingRows) {
    if (!sourceByApplication.has(row.applicationId)) sourceByApplication.set(row.applicationId, sourceFromEvidence(row))
  }

  const applicationIds = [...sourceByApplication.keys()]
  const profiles = applicationIds.length
    ? await db.select({
        applicationId: recruitmentApplicationProfile.applicationId,
        lastStatus: recruitmentApplicationProfile.lastStatus,
      })
        .from(recruitmentApplicationProfile)
        .where(and(
          eq(recruitmentApplicationProfile.organizationId, orgId),
          inArray(recruitmentApplicationProfile.applicationId, applicationIds),
        ))
    : []

  const profileByApplication = new Map(profiles.map(row => [row.applicationId, row.lastStatus]))
  const buckets = new Map<SourceCategory, { source: SourceCategory; candidates: number; interviewed: number; offered: number; joined: number }>(
    SOURCE_CATEGORIES.map(source => [source, { source, candidates: 0, interviewed: 0, offered: 0, joined: 0 }]),
  )

  const interviewStages = ['hiring_manager_round_pending', 'hiring_manager_round_completed', 'hod_round_pending', 'hod_round_completed', 'hr_round_pending', 'hr_round_completed', 'offer_stage', 'offer_accepted', 'offer_declined', 'joined', 'closed']
  const offerStages = ['offer_stage', 'offer_accepted', 'offer_declined', 'joined', 'closed']
  const joinedStages = ['joined', 'closed']

  for (const [applicationId, source] of sourceByApplication) {
    const bucket = buckets.get(source)!
    const status = profileByApplication.get(applicationId) ?? null
    bucket.candidates++
    if (stageReached(status, interviewStages)) bucket.interviewed++
    if (stageReached(status, offerStages)) bucket.offered++
    if (stageReached(status, joinedStages)) bucket.joined++
  }

  return {
    period,
    categories: SOURCE_CATEGORIES.map((source) => {
      const row = buckets.get(source)!
      return {
        ...row,
        joinConversion: row.candidates ? Number(((row.joined / row.candidates) * 100).toFixed(1)) : 0,
      }
    }),
    note: 'Sources are standardised to Naukri, Social Media, Referral, Database, Consultant and Others. Unmapped or missing source labels are grouped under Others.',
  }
})
