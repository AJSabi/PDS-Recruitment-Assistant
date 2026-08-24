import { and, eq } from 'drizzle-orm'
import { application } from '../../../database/schema/app'
import { member } from '../../../database/schema/auth'
import { recruitmentApplicationProfile, recruitmentEvidence } from '../../../database/schema/recruitmentWorkflow'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })
const bodySchema = z.object({ recruiterUserId: z.string().min(1).nullable() }).strict()

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { application: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { id: applicationId } = await getValidatedRouterParams(event, paramsSchema.parse)
  const body = await readValidatedBody(event, bodySchema.parse)

  const app = await db.query.application.findFirst({
    where: and(eq(application.id, applicationId), eq(application.organizationId, orgId)),
    columns: { id: true },
  })
  if (!app) throw createError({ statusCode: 404, statusMessage: 'Application not found' })

  if (body.recruiterUserId) {
    const orgMember = await db.query.member.findFirst({
      where: and(eq(member.organizationId, orgId), eq(member.userId, body.recruiterUserId)),
      columns: { id: true },
    })
    if (!orgMember) throw createError({ statusCode: 422, statusMessage: 'Selected recruiter is not a member of this organization.' })
  }

  const profile = await db.query.recruitmentApplicationProfile.findFirst({
    where: and(eq(recruitmentApplicationProfile.applicationId, applicationId), eq(recruitmentApplicationProfile.organizationId, orgId)),
  })
  if (!profile) throw createError({ statusCode: 404, statusMessage: 'Recruitment profile not found' })

  const now = new Date()
  const [updated] = await db.update(recruitmentApplicationProfile).set({
    assignedRecruiterId: body.recruiterUserId,
    lastUpdatedBy: session.user.id,
    updatedAt: now,
  }).where(eq(recruitmentApplicationProfile.id, profile.id)).returning()

  await db.insert(recruitmentEvidence).values({
    organizationId: orgId,
    applicationId,
    type: 'assignment_change',
    summary: body.recruiterUserId ? 'Candidate recruiter assignment updated.' : 'Candidate recruiter assignment removed.',
    payload: { previousRecruiterId: profile.assignedRecruiterId ?? null, recruiterUserId: body.recruiterUserId },
    createdBy: session.user.id,
  })

  return { profile: updated }
})
