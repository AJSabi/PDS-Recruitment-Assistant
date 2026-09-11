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

  return db.transaction(async (tx) => {
    const [updatedState] = await tx.update(recruitmentRequirementState)
      .set({
        revision: state.revision + 1,
        jdVersion: changeType === 'jd' ? state.jdVersion + 1 : state.jdVersion,
        skillMatrixVersion: changeType === 'skill_matrix' ? state.skillMatrixVersion + 1 : state.skillMatrixVersion,
        skillMatrixApproved: changeType === 'jd' ? false : state.skillMatrixApproved,
        skillMatrixApprovedAt: changeType === 'jd' ? null : state.skillMatrixApprovedAt,
        lastMaterialChangeAt: now,
        updatedAt: now,
      })
      .where(and(
        eq(recruitmentRequirementState.id, state.id),
        eq(recruitmentRequirementState.organizationId, organizationId),
        eq(recruitmentRequirementState.revision, state.revision),
      ))
      .returning()

    if (!updatedState) {
      throw createError({
        statusCode: 409,
        statusMessage: 'The requirement changed while this update was being processed. Reload the requirement and try again.',
      })
    }

    const affected = await tx.select({
      applicationId: application.id,
      profileId: recruitmentApplicationProfile.id,
      currentFit: recruitmentApplicationProfile.currentFit,
      lastStatus: recruitmentApplicationProfile.lastStatus,
      requirementVersionAssessed: recruitmentApplicationProfile.requirementVersionAssessed,
    })
      .from(application)
      .innerJoin(
        recruitmentApplicationProfile,
        and(
          eq(recruitmentApplicationProfile.applicationId, application.id),
          eq(recruitmentApplicationProfile.organizationId, organizationId),
        ),
      )
      .where(and(
        eq(application.organizationId, organizationId),
        eq(application.jobId, jobId),
      ))

    const assessed = affected.filter(item => item.requirementVersionAssessed > 0)

    await tx.update(recruitmentRequirementState)
      .set({ reassessmentRequired: assessed.length > 0, updatedAt: now })
      .where(and(
        eq(recruitmentRequirementState.id, updatedState.id),
        eq(recruitmentRequirementState.organizationId, organizationId),
      ))

    if (changeType === 'jd') {
      await tx.update(jobSkillMatrix)
        .set({ approvedAt: null, updatedAt: now })
        .where(and(eq(jobSkillMatrix.organizationId, organizationId), eq(jobSkillMatrix.jobId, jobId)))
    }

    for (const item of assessed) {
      await tx.update(recruitmentApplicationProfile)
        .set({
          nextAction: 'Reassessment recommended due to material requirement change',
          lastUpdatedBy: actorId ?? null,
          updatedAt: now,
        })
        .where(and(
          eq(recruitmentApplicationProfile.id, item.profileId),
          eq(recruitmentApplicationProfile.organizationId, organizationId),
        ))

      await tx.insert(recruitmentEvidence).values({
        organizationId,
        applicationId: item.applicationId,
        type: 'requirement_change',
        summary,
        payload: {
          changeType,
          requirementRevision: updatedState.revision,
          jdVersion: updatedState.jdVersion,
          skillMatrixVersion: updatedState.skillMatrixVersion,
          previouslyAssessedRevision: item.requirementVersionAssessed,
          currentFitPreserved: item.currentFit,
          lastStatusPreserved: item.lastStatus,
        },
        createdBy: actorId ?? null,
      })
    }

    return {
      state: {
        ...updatedState,
        reassessmentRequired: assessed.length > 0,
      },
      affectedApplications: assessed.length,
    }
  })
}
