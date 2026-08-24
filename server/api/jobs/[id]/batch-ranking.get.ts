import { and, eq, inArray } from 'drizzle-orm'
import { application, candidate, recruitmentApplicationProfile, resumeAssessment } from '../../../../database/schema'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })

const priorityOrder: Record<string, number> = { P1: 1, P2: 2, P3: 3, P4: 4 }

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['read'] })
  const orgId = session.session.activeOrganizationId
  const { id: jobId } = await getValidatedRouterParams(event, paramsSchema.parse)

  const apps = await db.select({
    applicationId: application.id,
    candidateId: application.candidateId,
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    email: candidate.email,
  }).from(application)
    .innerJoin(candidate, eq(candidate.id, application.candidateId))
    .where(and(eq(application.organizationId, orgId), eq(application.jobId, jobId)))

  if (!apps.length) return { jobId, ranking: [] }
  const appIds = apps.map(a => a.applicationId)

  const profiles = await db.select().from(recruitmentApplicationProfile)
    .where(and(eq(recruitmentApplicationProfile.organizationId, orgId), inArray(recruitmentApplicationProfile.applicationId, appIds)))
  const assessments = await db.select().from(resumeAssessment)
    .where(and(eq(resumeAssessment.organizationId, orgId), inArray(resumeAssessment.applicationId, appIds)))

  const profileMap = new Map(profiles.map(p => [p.applicationId, p]))
  const assessmentMap = new Map(assessments.map(a => [a.applicationId, a]))

  const ranking = apps.map((app) => {
    const profile = profileMap.get(app.applicationId)
    const assessment = assessmentMap.get(app.applicationId)
    return {
      applicationId: app.applicationId,
      candidateId: app.candidateId,
      candidate: `${app.firstName} ${app.lastName}`.trim(),
      email: app.email,
      provisionalFitScore: assessment?.provisionalFitScore ?? profile?.provisionalFitScore ?? null,
      mandatoryMatch: assessment?.mandatoryMatch ?? profile?.mandatoryMatch ?? null,
      keyStrength: assessment?.keyStrength ?? profile?.keyStrength ?? null,
      mainGap: assessment?.mainGap ?? profile?.mainGap ?? null,
      priority: assessment?.priority ?? profile?.priority ?? null,
      currentFit: profile?.currentFit ?? 'not_yet_assessed',
      lastStatus: profile?.lastStatus ?? 'resume_received',
      assessed: Boolean(assessment),
    }
  }).sort((a, b) => {
    const pa = a.priority ? priorityOrder[a.priority] ?? 99 : 99
    const pb = b.priority ? priorityOrder[b.priority] ?? 99 : 99
    if (pa !== pb) return pa - pb
    return (b.provisionalFitScore ?? -1) - (a.provisionalFitScore ?? -1)
  }).map((item, index) => ({ rank: index + 1, ...item }))

  return { jobId, ranking }
})
