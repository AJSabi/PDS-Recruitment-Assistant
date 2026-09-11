import { findCandidateIdentityConflicts } from '../../../utils/candidateIdentityConflict'
import { findCandidateIdentityMatch } from '../../../utils/candidateIdentityMatch'
import { assertRequirementAccess } from '../../../utils/recruitmentVisibility'
import { z } from 'zod'

const paramsSchema = z.object({ id: z.string().min(1) })
const bodySchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().max(100).optional(),
  email: z.string().trim().email().max(255).transform(value => value.toLowerCase()),
  phone: z.string().trim().max(50).optional(),
})

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { candidate: ['create'] })
  const orgId = session.session.activeOrganizationId
  const { id: jobId } = await getValidatedRouterParams(event, paramsSchema.parse)
  await assertRequirementAccess(orgId, session.user.id, jobId)
  const body = await readValidatedBody(event, bodySchema.parse)

  const match = await findCandidateIdentityMatch(orgId, body)
  if (!match) return { matched: false as const }

  const matchedCandidate = match.candidate
  if (matchedCandidate.quarantinedAt) {
    throw createError({ statusCode: 409, statusMessage: 'A matching candidate is in retention quarantine and cannot be linked through recruiter intake.' })
  }

  const conflicts = findCandidateIdentityConflicts(matchedCandidate, body)
  return {
    matched: true as const,
    matchBasis: match.basis,
    requiresConfirmation: conflicts.length > 0,
    conflicts,
    candidate: {
      id: matchedCandidate.id,
      firstName: matchedCandidate.firstName,
      lastName: matchedCandidate.lastName,
      email: matchedCandidate.email,
      phone: matchedCandidate.phone,
    },
  }
})
