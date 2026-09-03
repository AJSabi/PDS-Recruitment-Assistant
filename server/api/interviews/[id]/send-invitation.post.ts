import { and, eq } from 'drizzle-orm'
import { interview, application, emailTemplate, organization } from '../../../database/schema'
import { interviewIdParamSchema } from '../../../utils/schemas/interview'
import { sendInterviewInvitationSchema, SYSTEM_TEMPLATES } from '../../../utils/schemas/emailTemplate'
import { sendInterviewInvitationEmail, renderTemplate, getFromEmail, type InterviewEmailData } from '../../../utils/email'
import { generateInterviewICS } from '../../../utils/ical'
import { buildResponseUrls } from '../../../utils/interview-token'
import { assertInterviewAccess } from '../../../utils/recruitmentVisibility'

const interviewTypeLabels: Record<string, string> = {
  video: 'Video Call', phone: 'Phone Call', in_person: 'In Person', technical: 'Technical Interview', panel: 'Panel Interview', take_home: 'Take-Home Assignment',
}

export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { interview: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { id } = await getValidatedRouterParams(event, interviewIdParamSchema.parse)
  await assertInterviewAccess(orgId, session.user.id, id)
  const body = await readValidatedBody(event, sendInterviewInvitationSchema.parse)

  const interviewRecord = await db.query.interview.findFirst({ where: and(eq(interview.id, id), eq(interview.organizationId, orgId)) })
  if (!interviewRecord) throw createError({ statusCode: 404, statusMessage: 'Interview not found' })
  if (interviewRecord.status !== 'scheduled') throw createError({ statusCode: 400, statusMessage: `Cannot send invitation for a ${interviewRecord.status} interview` })

  if (interviewRecord.invitationSentAt) {
    const elapsed = Date.now() - new Date(interviewRecord.invitationSentAt).getTime()
    if (elapsed < 2 * 60 * 1000) throw createError({ statusCode: 429, statusMessage: 'Invitation was already sent recently. Please wait before resending.' })
  }

  const app = await db.query.application.findFirst({
    where: and(eq(application.id, interviewRecord.applicationId), eq(application.organizationId, orgId)),
    with: { candidate: true, job: { columns: { title: true } } },
  })
  if (!app?.candidate) throw createError({ statusCode: 404, statusMessage: 'Application or candidate not found' })

  const org = await db.query.organization.findFirst({ where: eq(organization.id, orgId), columns: { name: true } })
  if (!org) throw createError({ statusCode: 404, statusMessage: 'Organization not found' })

  let emailSubject: string
  let emailBody: string
  if (body.templateId) {
    const systemTemplate = SYSTEM_TEMPLATES.find(t => t.id === body.templateId)
    if (systemTemplate) {
      emailSubject = systemTemplate.subject
      emailBody = systemTemplate.body
    } else {
      const customTemplate = await db.query.emailTemplate.findFirst({ where: and(eq(emailTemplate.id, body.templateId), eq(emailTemplate.organizationId, orgId)) })
      if (!customTemplate) throw createError({ statusCode: 404, statusMessage: 'Email template not found' })
      emailSubject = customTemplate.subject
      emailBody = customTemplate.body
    }
  } else if (body.customSubject && body.customBody) {
    emailSubject = body.customSubject
    emailBody = body.customBody
  } else {
    throw createError({ statusCode: 400, statusMessage: 'Either a template or custom subject/body is required' })
  }

  const scheduledAt = new Date(interviewRecord.scheduledAt)
  const candidateName = `${app.candidate.firstName} ${app.candidate.lastName}`
  const fromEmail = getFromEmail()
  const baseUrl = env.BETTER_AUTH_URL || (env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : '') || 'https://reqcore.com'
  const responseUrls = buildResponseUrls(baseUrl, interviewRecord.id, env.BETTER_AUTH_SECRET)

  const renderedSubjectForIcs = renderTemplate(emailSubject, {
    candidateName,
    candidateFirstName: app.candidate.firstName,
    candidateLastName: app.candidate.lastName,
    candidateEmail: app.candidate.email,
    jobTitle: app.job.title,
    interviewTitle: interviewRecord.title,
    interviewDate: '', interviewTime: '', interviewDuration: interviewRecord.duration,
    interviewType: interviewTypeLabels[interviewRecord.type] ?? interviewRecord.type,
    interviewLocation: interviewRecord.location,
    interviewers: interviewRecord.interviewers as string[] | null,
    organizationName: org.name,
  })

  const icsContent = generateInterviewICS({
    interviewId: interviewRecord.id,
    summary: renderedSubjectForIcs,
    description: [`Interview: ${interviewRecord.title}`, `Position: ${app.job.title}`, `Candidate: ${candidateName}`, `Type: ${interviewTypeLabels[interviewRecord.type] ?? interviewRecord.type}`, `Duration: ${interviewRecord.duration} minutes`, ...(interviewRecord.location ? [`Location: ${interviewRecord.location}`] : []), '', `Respond: ${responseUrls.accepted}`].join('\n'),
    startTime: scheduledAt,
    durationMinutes: interviewRecord.duration,
    location: interviewRecord.location,
    organizerName: org.name,
    organizerEmail: fromEmail.replace(/^.*</, '').replace(/>$/, ''),
    attendeeEmail: app.candidate.email,
    attendeeName: candidateName,
  })

  const emailData: InterviewEmailData = {
    candidateName,
    candidateFirstName: app.candidate.firstName,
    candidateLastName: app.candidate.lastName,
    candidateEmail: app.candidate.email,
    jobTitle: app.job.title,
    interviewTitle: interviewRecord.title,
    interviewDate: scheduledAt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: interviewRecord.timezone ?? 'UTC' }),
    interviewTime: scheduledAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: interviewRecord.timezone ?? 'UTC' }),
    interviewDuration: interviewRecord.duration,
    interviewType: interviewTypeLabels[interviewRecord.type] ?? interviewRecord.type,
    interviewLocation: interviewRecord.location,
    interviewers: interviewRecord.interviewers as string[] | null,
    organizationName: org.name,
    responseUrls,
    icsContent,
  }

  await sendInterviewInvitationEmail({ subject: emailSubject, body: emailBody, data: emailData })
  const [updated] = await db.update(interview).set({ invitationSentAt: new Date(), updatedAt: new Date() }).where(and(eq(interview.id, id), eq(interview.organizationId, orgId))).returning()

  recordActivity({ organizationId: orgId, actorId: session.user.id, action: 'updated', resourceType: 'interview', resourceId: id, metadata: { action: 'invitation_sent', candidateEmail: app.candidate.email, templateId: body.templateId ?? 'custom' } })
  return { success: true, sentAt: updated?.invitationSentAt, candidateEmail: app.candidate.email }
})
