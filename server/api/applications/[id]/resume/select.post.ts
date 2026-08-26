import { and, eq } from 'drizzle-orm'
import { document, recruitmentApplicationProfile, recruitmentEvidence } from '../../../../database/schema'
import { syncApplicationStatusForRecruitmentStage } from '../../../../utils/recruitmentApplicationStatus'
import { assertApplicationAccess } from '../../../../utils/recruitmentVisibility'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })
const bodySchema = z.object({ documentId: z.string().uuid() }).strict()
const allowedStatuses = new Set(['candidate_added', 'resume_received', 'reassess'])

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['update'], document: ['read'] })
  const orgId = session.session.activeOrganizationId
  const { id: applicationId } = await getValidatedRouterParams(event, paramsSchema.parse)
  const app = await assertApplicationAccess(orgId, session.user.id, applicationId)
  const body = await readValidatedBody(event, bodySchema.parse)

  const resume = await db.query.document.findFirst({
    where: and(eq(document.id, body.documentId), eq(document.organizationId, orgId), eq(document.candidateId, app.candidateId), eq(document.type, 'resume')),
    columns: { id: true, originalFilename: true, createdAt: true },
  })
  if (!resume) throw createError({ statusCode: 404, statusMessage: 'Resume document not found for this candidate' })

  const profile = await db.query.recruitmentApplicationProfile.findFirst({
    where: and(eq(recruitmentApplicationProfile.applicationId, applicationId), eq(recruitmentApplicationProfile.organizationId, orgId)),
  })
  if (!profile) throw createError({ statusCode: 404, statusMessage: 'Recruitment profile not found' })
  if (!allowedStatuses.has(profile.lastStatus)) {
    throw createError({ statusCode: 422, statusMessage: `Resume selection cannot change while candidate status is ${profile.lastStatus}. Use Reassess first if a new resume must replace the assessed baseline.` })
  }

  const now = new Date()
  const initialReceipt = profile.lastStatus === 'candidate_added'
  const nextStatus = initialReceipt ? 'resume_received' : profile.lastStatus
  const nextAction = profile.lastStatus === 'reassess' ? 'Complete reassessment using the selected resume.' : 'Complete resume assessment against the approved requirement baseline.'

  const [updatedProfile] = await db.update(recruitmentApplicationProfile).set({ selectedResumeDocumentId: resume.id, lastStatus: nextStatus, ...(initialReceipt ? { statusDate: now } : {}), nextAction, lastUpdatedBy: session.user.id, updatedAt: now }).where(eq(recruitmentApplicationProfile.id, profile.id)).returning()
  if (initialReceipt) await syncApplicationStatusForRecruitmentStage(orgId, applicationId, 'resume_received')

  const [evidence] = await db.insert(recruitmentEvidence).values({
    organizationId: orgId,
    applicationId,
    type: 'resume',
    summary: `Resume selected for application: ${resume.originalFilename}`,
    payload: { event: profile.lastStatus === 'reassess' ? 'resume_selected_for_reassessment' : 'resume_selected', documentId: resume.id, originalFilename: resume.originalFilename, previousDocumentId: profile.selectedResumeDocumentId ?? null, previousStatus: profile.lastStatus, currentFitPreserved: profile.currentFit },
    createdBy: session.user.id,
  }).returning()

  return { profile: updatedProfile, resume, evidence, statusChanged: initialReceipt }
})
