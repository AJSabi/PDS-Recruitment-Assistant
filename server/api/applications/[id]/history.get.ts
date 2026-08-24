import { and, desc, eq } from 'drizzle-orm'
import { application, candidate, job, recruitmentApplicationProfile, recruitmentEvidence, recruiterScreeningSession, resumeAssessment } from '../../../database/schema'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['read'] })
  const orgId = session.session.activeOrganizationId
  const { id: applicationId } = await getValidatedRouterParams(event, paramsSchema.parse)

  const app = await db.query.application.findFirst({
    where: and(eq(application.id, applicationId), eq(application.organizationId, orgId)),
  })
  if (!app) throw createError({ statusCode: 404, statusMessage: 'Application not found' })

  const [person, requirement, profile, resume, screening, evidence] = await Promise.all([
    db.query.candidate.findFirst({ where: and(eq(candidate.id, app.candidateId), eq(candidate.organizationId, orgId)) }),
    db.query.job.findFirst({ where: and(eq(job.id, app.jobId), eq(job.organizationId, orgId)), columns: { id: true, title: true, location: true } }),
    db.query.recruitmentApplicationProfile.findFirst({ where: and(eq(recruitmentApplicationProfile.applicationId, applicationId), eq(recruitmentApplicationProfile.organizationId, orgId)) }),
    db.query.resumeAssessment.findFirst({ where: and(eq(resumeAssessment.applicationId, applicationId), eq(resumeAssessment.organizationId, orgId)) }),
    db.query.recruiterScreeningSession.findFirst({ where: and(eq(recruiterScreeningSession.applicationId, applicationId), eq(recruiterScreeningSession.organizationId, orgId)) }),
    db.query.recruitmentEvidence.findMany({
      where: and(eq(recruitmentEvidence.applicationId, applicationId), eq(recruitmentEvidence.organizationId, orgId)),
      orderBy: [desc(recruitmentEvidence.createdAt)],
    }),
  ])

  return {
    application: app,
    candidate: person,
    requirement,
    profile,
    resumeAssessment: resume,
    screening,
    evidence,
  }
})
