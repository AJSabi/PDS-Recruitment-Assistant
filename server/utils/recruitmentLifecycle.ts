import { and, eq } from 'drizzle-orm'
import { application, jobSkillMatrix, recruitmentApplicationProfile, recruitmentEvidence, recruitmentRequirementState } from '../database/schema'

export async function ensureRequirementState(organizationId: string, jobId: string) {
  const existing = await db.query.recruitmentRequirementState.findFirst({
    where: and(eq(recruitmentRequirementState.organizationId, organizationId), eq(recruitmentRequirementState.jobId, jobId)),
  })
  if (existing) return existing

  const [created] = await db.insert(recruitmentRequirementState).values({ organizationId, jobId }).returning()
  if (!created) {
    throw createError({ statusCode: 500, statusMessage: 'Requirement state could not be created.' })
  }
  return created
}

export async function refreshRequirementReassessmentFlag(organizationId: string, jobId: string) {
  const state = await ensureRequirementState(organizationId, jobId)
  const apps = await db.query.application.findMany({
    where: and(eq(application.organizationId, organizationId), eq(application.jobId, jobId)),
    columns: { id: true },
  })

  let staleAssessmentExists = false
  for (const app of apps) {
    const profile = await db.query.recruitmentApplicationProfile.findFirst({
      where: and(
        eq(recruitmentApplicationProfile.organizationId, organizationId),
        eq(recruitmentApplicationProfile.applicationId, app.id),
      ),
      columns: { requirementVersionAssessed: true },
    })
    if (profile && profile.requirementVersionAssessed > 0 && profile.requirementVersionAssessed < state.revision) {
      staleAssessmentExists = true
      break
    }
  }

  if (state.reassessmentRequired !== staleAssessmentExists) {
    const [updated] = await db.update(recruitmentRequirementState)
      .set({ reassessmentRequired: staleAssessmentExists, updatedAt: new Date() })
      .where(eq(recruitmentRequirementState.id, state.id))
      .returning()
    return updated ?? state
  }
  return state
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

  const apps = await db.query.application.findMany({
    where: and(eq(application.organizationId, organizationId), eq(application.jobId, jobId)),
    columns: { id: true },
  })

  const affected: Array<{
    applicationId: string
    profileId: string
    currentFit: string
    lastStatus: string
    requirementVersionAssessed: number
  }> = []

  for (const app of apps) {
    const profile = await db.query.recruitmentApplicationProfile.findFirst({
      where: and(
        eq(recruitmentApplicationProfile.organizationId, organizationId),
        eq(recruitmentApplicationProfile.applicationId, app.id),
      ),
      columns: {
        id: true,
        currentFit: true,
        lastStatus: true,
        requirementVersionAssessed: true,
      },
    })

    if (profile && profile.requirementVersionAssessed > 0) {
      affected.push({
        applicationId: app.id,
        profileId: profile.id,
        currentFit: profile.currentFit,
        lastStatus: profile.lastStatus,
        requirementVersionAssessed: profile.requirementVersionAssessed,
      })
    }
  }

  const [updatedState] = await db.update(recruitmentRequirementState)
    .set({
      revision: state.revision + 1,
      jdVersion: changeType === 'jd' ? state.jdVersion + 1 : state.jdVersion,
      skillMatrixVersion: changeType === 'skill_matrix' ? state.skillMatrixVersion + 1 : state.skillMatrixVersion,
      skillMatrixApproved: changeType === 'jd' ? false : state.skillMatrixApproved,
      skillMatrixApprovedAt: changeType === 'jd' ? null : state.skillMatrixApprovedAt,
      lastMaterialChangeAt: now,
      reassessmentRequired: affected.length > 0,
      updatedAt: now,
    })
    .where(eq(recruitmentRequirementState.id, state.id))
    .returning()

  if (changeType === 'jd') {
    await db.update(jobSkillMatrix)
      .set({ approvedAt: null, updatedAt: now })
      .where(and(eq(jobSkillMatrix.organizationId, organizationId), eq(jobSkillMatrix.jobId, jobId)))
  }

  for (const item of affected) {
    await db.update(recruitmentApplicationProfile)
      .set({
        nextAction: 'Reassessment recommended due to material requirement change',
        lastUpdatedBy: actorId ?? null,
        updatedAt: now,
      })
      .where(eq(recruitmentApplicationProfile.id, item.profileId))

    await db.insert(recruitmentEvidence).values({
      organizationId,
      applicationId: item.applicationId,
      type: 'requirement_change',
      summary,
      payload: {
        changeType,
        requirementRevision: updatedState?.revision ?? state.revision + 1,
        jdVersion: updatedState?.jdVersion ?? state.jdVersion,
        skillMatrixVersion: updatedState?.skillMatrixVersion ?? state.skillMatrixVersion,
        previouslyAssessedRevision: item.requirementVersionAssessed,
        currentFitPreserved: item.currentFit,
        lastStatusPreserved: item.lastStatus,
      },
      createdBy: actorId ?? null,
    })
  }

  return { state: updatedState ?? state, affectedApplications: affected.length }
}
