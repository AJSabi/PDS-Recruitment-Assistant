import { and, eq } from 'drizzle-orm'
import { application, candidate, job } from '../../../database/schema/app'
import { recruitmentApplicationProfile } from '../../../database/schema/recruitmentWorkflow'
import { user } from '../../../database/schema/auth'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['read'] })
  const orgId = session.session.activeOrganizationId
  const { id: jobId } = await getValidatedRouterParams(event, paramsSchema.parse)

  const requirement = await db.query.job.findFirst({
    where: and(eq(job.id, jobId), eq(job.organizationId, orgId)),
    columns: { id: true, title: true, status: true },
  })
  if (!requirement) throw createError({ statusCode: 404, statusMessage: 'Job not found' })

  const rows = await db.select({
    applicationId: application.id,
    applicationCreatedAt: application.createdAt,
    candidateId: candidate.id,
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    email: candidate.email,
    phone: candidate.phone,
    assignedRecruiterId: recruitmentApplicationProfile.assignedRecruiterId,
    lastContactAt: recruitmentApplicationProfile.lastContactAt,
    resumeBrief: recruitmentApplicationProfile.resumeBrief,
    conversationBrief: recruitmentApplicationProfile.conversationBrief,
    currentFit: recruitmentApplicationProfile.currentFit,
    lastStatus: recruitmentApplicationProfile.lastStatus,
    statusDate: recruitmentApplicationProfile.statusDate,
    nextAction: recruitmentApplicationProfile.nextAction,
    priority: recruitmentApplicationProfile.priority,
    provisionalFitScore: recruitmentApplicationProfile.provisionalFitScore,
    assessmentLocked: recruitmentApplicationProfile.assessmentLocked,
    requirementVersionAssessed: recruitmentApplicationProfile.requirementVersionAssessed,
    lastUpdatedById: recruitmentApplicationProfile.lastUpdatedBy,
    lastUpdatedByName: user.name,
    updatedAt: recruitmentApplicationProfile.updatedAt,
  })
    .from(application)
    .innerJoin(candidate, eq(candidate.id, application.candidateId))
    .leftJoin(recruitmentApplicationProfile, and(
      eq(recruitmentApplicationProfile.applicationId, application.id),
      eq(recruitmentApplicationProfile.organizationId, orgId),
    ))
    .leftJoin(user, eq(user.id, recruitmentApplicationProfile.lastUpdatedBy))
    .where(and(eq(application.organizationId, orgId), eq(application.jobId, jobId)))

  const register = rows.map((row) => ({
    ...row,
    candidate: `${row.firstName} ${row.lastName}`.trim(),
    currentFit: row.currentFit ?? 'not_yet_assessed',
    lastStatus: row.lastStatus ?? 'candidate_added',
    nextAction: row.nextAction ?? 'Upload or verify the latest resume.',
    lastUpdatedBy: row.lastUpdatedByName ?? (row.lastUpdatedById ? 'User' : null),
  }))

  const stageCounts = register.reduce<Record<string, number>>((acc, row) => {
    acc[row.lastStatus] = (acc[row.lastStatus] ?? 0) + 1
    return acc
  }, {})

  const summary = {
    totalCandidates: register.length,
    assigned: register.filter(r => Boolean(r.assignedRecruiterId)).length,
    unassigned: register.filter(r => !r.assignedRecruiterId && !['closed', 'joined', 'not_proceeding'].includes(r.lastStatus)).length,
    assessed: register.filter(r => r.currentFit !== 'not_yet_assessed').length,
    notYetAssessed: register.filter(r => r.currentFit === 'not_yet_assessed').length,
    actionPending: register.filter(r => !['closed', 'joined', 'not_proceeding'].includes(r.lastStatus)).length,
    closed: register.filter(r => r.lastStatus === 'closed').length,
    stageCounts,
  }

  return { requirement, summary, register }
})
