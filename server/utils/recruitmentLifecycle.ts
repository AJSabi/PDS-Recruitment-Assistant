import { and, eq } from 'drizzle-orm'
import { application, recruitmentApplicationProfile, recruitmentEvidence, recruitmentRequirementState } from '../database/schema'

export async function ensureRequirementState(organizationId: string, jobId: string) {
  const existing = await db.query.recruitmentRequirementState.findFirst({
    where: and(eq(recruitmentRequirementState.organizationId, organizationId), eq(recruitmentRequirementState.jobId, jobId)),
  })
  if (existing) return existing

  const [created] = await db.insert(recruitmentRequirementState).values({ organizationId, jobId }).returning()
  return created
}

export async function flagRequirementChange(input: {
  organizationId: string
  jobId: string
  actorId?: string | null
  changeType: 'jd' | 'skill_matrix'
  summary: string
}) {
  const { organizationId, jobId, actorId, changeType, summary } = input
  const state = await ensureRequirementState(organizationId, jobId)
  const now = new Date()

  const [updatedState] = await db.update(recruitmentRequirementState)
    .set({
      jdVersion: changeType === 'jd' ? state.jdVersion + 1 : state.jdVersion,
      skillMatrixVersion: changeType === 'skill_matrix' ? state.skillMatrixVersion + 1 : state.skillMatrixVersion,
      lastMaterialChangeAt: now,
      reassessmentRequired: true,
      updatedAt: now,
    })
    .where(eq(recruitmentRequirementState.id, state.id))
    .returning()

  const apps = await db.query.application.findMany({
    where: and(eq(application.organizationId, organizationId), eq(application.jobId, jobId)),
    columns: { id: true },
  })

  for (const app of apps) {
    const profile = await db.query.recruitmentApplicationProfile.findFirst({
      where: and(
        eq(recruitmentApplicationProfile.organizationId, organizationId),
        eq(recruitmentApplicationProfile.applicationId, app.id),
      ),
      columns: { id: true, currentFit: true, lastStatus: true },
    })

    if (profile) {
      await db.update(recruitmentApplicationProfile)
        .set({
          nextAction: 'Reassessment recommended due to material requirement change',
          lastUpdatedBy: actorId ?? null,
          updatedAt: now,
        })
        .where(eq(recruitmentApplicationProfile.id, profile.id))
    }

    await db.insert(recruitmentEvidence).values({
      organizationId,
      applicationId: app.id,
      type: 'requirement_change',
      summary,
      payload: {
        changeType,
        jdVersion: updatedState?.jdVersion ?? state.jdVersion,
        skillMatrixVersion: updatedState?.skillMatrixVersion ?? state.skillMatrixVersion,
        currentFitPreserved: profile?.currentFit ?? null,
        lastStatusPreserved: profile?.lastStatus ?? null,
      },
      createdBy: actorId ?? null,
    })
  }

  return { state: updatedState ?? state, affectedApplications: apps.length }
}
