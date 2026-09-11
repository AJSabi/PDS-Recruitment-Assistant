import { and, eq } from 'drizzle-orm'
import { application, document, recruitmentApplicationProfile, recruitmentEvidence } from '../../../../database/schema'
import { coarseStatusForRecruitmentStage } from '../../../../utils/recruitmentApplicationStatus'
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
  const coarseStatus = initialReceipt ? coarseStatusForRecruitmentStage('resume_received') : null

  const result = await db.transaction(async (tx) => {
    const [updatedProfile] = await tx.update(recruitmentApplicationProfile).set({
      selectedResumeDocumentId: resume.id,
      lastStatus: nextStatus,
      ...(initialReceipt ? { statusDate: now } : {}),
      nextAction,
      lastUpdatedBy: session.user.id,
      updatedAt: now,
    }).where(and(
      eq(recruitmentApplicationProfile.id, profile.id),
      eq(recruitmentApplicationProfile.organizationId, orgId),
      eq(recruitmentApplicationProfile.lastStatus, profile.lastStatus),
      eq(recruitmentApplicationProfile.updatedAt, profile.updatedAt),
    )).returning()
    if (!updatedProfile) throw createError({ statusCode: 409, statusMessage: 'Recruitment profile changed before the resume could be selected. Refresh and try again.' })

    if (coarseStatus) {
      const [applicationUpdated] = await tx.update(application)
        .set({ status: coarseStatus, updatedAt: now })
        .where(and(eq(application.id, applicationId), eq(application.organizationId, orgId)))
        .returning({ id: application.id })
      if (!applicationUpdated) throw createError({ statusCode: 409, statusMessage: 'Application changed before the resume could be selected. Refresh and try again.' })
    }

    if (initialReceipt) {
      await tx.insert(recruitmentEvidence).values({
        organizationId: orgId,
        applicationId,
        type: 'stage_change',
        summary: `Recruitment stage changed from ${profile.lastStatus} to resume_received`,
        payload: {
          event: 'stage_changed',
          from: profile.lastStatus,
          to: 'resume_received',
          source: 'resume_selection',
          documentId: resume.id,
        },
        createdBy: session.user.id,
      })
    }

    const [evidence] = await tx.insert(recruitmentEvidence).values({
      organizationId: orgId,
      applicationId,
      type: 'resume',
      summary: `Resume selected for application: ${resume.originalFilename}`,
      payload: {
        event: profile.lastStatus === 'reassess' ? 'resume_selected_for_reassessment' : 'resume_selected',
        documentId: resume.id,
        originalFilename: resume.originalFilename,
        previousDocumentId: profile.selectedResumeDocumentId ?? null,
        previousStatus: profile.lastStatus,
        currentFitPreserved: profile.currentFit,
      },
      createdBy: session.user.id,
    }).returning()

    return { updatedProfile, evidence }
  })

  return { profile: result.updatedProfile, resume, evidence: result.evidence, statusChanged: initialReceipt }
})