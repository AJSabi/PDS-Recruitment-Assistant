<script setup lang="ts">
import { AlertTriangle, ArrowRight, Briefcase, CalendarDays, CheckCircle2, Clock3, FileText, MapPin, Search, Target, UserCheck, Users } from '@lucide/vue'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'require-org'] })

const route = useRoute()
const localePath = useLocalePath()
const jobId = route.params.id as string
const { formatPersonName } = useOrgSettings()
const { job: jobData, status: jobFetchStatus, error: jobError } = useJob(jobId)

const { data: requirementData, status: requirementStatus, error: requirementError } = useFetch(() => `/api/jobs/${jobId}/requirement-profile`, {
  key: `requirement-command-profile-${jobId}`,
  headers: useRequestHeaders(['cookie']),
})

const { data: appData, status: appFetchStatus, error: appError } = useFetch('/api/applications', {
  key: `requirement-command-apps-${jobId}`,
  query: { jobId, limit: 100 },
  headers: useRequestHeaders(['cookie']),
})

const applications = computed<any[]>(() => appData.value?.data ?? [])
const profile = computed<any>(() => requirementData.value?.profile ?? null)
const searchTerm = ref('')

const isLoading = computed(() => jobFetchStatus.value === 'pending' || requirementStatus.value === 'pending' || appFetchStatus.value === 'pending')

const activeApplications = computed(() => applications.value.filter(app => !['joined', 'closed', 'not_proceeding', 'offer_declined'].includes(app.recruitmentStatus ?? '')))
const interviewApplications = computed(() => applications.value.filter(app => ['hiring_manager_round_pending', 'hiring_manager_round_completed', 'hod_round_pending', 'hod_round_completed', 'hr_round_pending', 'hr_round_completed'].includes(app.recruitmentStatus ?? '')))
const offerApplications = computed(() => applications.value.filter(app => ['offer_stage', 'offer_accepted'].includes(app.recruitmentStatus ?? '')))
const joinedApplications = computed(() => applications.value.filter(app => app.recruitmentStatus === 'joined'))
const screeningApplications = computed(() => applications.value.filter(app => ['recruiter_screening_pending', 'recruiter_screening_completed', 'reassess', 'hold_for_comparison'].includes(app.recruitmentStatus ?? '')))

function daysBetween(start?: string | Date | null, end: Date = new Date()) {
  if (!start) return null
  return Math.max(0, Math.floor((end.getTime() - new Date(start).getTime()) / 86400000))
}

const tatDays = computed(() => daysBetween(profile.value?.assignmentDate))
const daysToClosure = computed(() => {
  if (!profile.value?.closureDate) return null
  return Math.ceil((new Date(profile.value.closureDate).getTime() - Date.now()) / 86400000)
})

const closureRisk = computed(() => {
  if (!profile.value?.allocated) return 'TAT not started'
  if (daysToClosure.value == null) return 'No closure target'
  if (daysToClosure.value < 0) return `${Math.abs(daysToClosure.value)} days overdue`
  if (daysToClosure.value <= 7) return `${daysToClosure.value} days to target`
  return 'On track'
})

const readiness = computed(() => [
  { label: 'Recruiter allocated', ready: Boolean(profile.value?.allocated), route: '/dashboard/team-allocation' },
  { label: 'JD available', ready: Boolean(profile.value?.hasActiveJd), route: `/dashboard/jobs/${jobId}/jd-upload` },
  { label: 'Skill Matrix approved', ready: Boolean(profile.value?.skillMatrixApproved), route: `/dashboard/jobs/${jobId}/jd-upload` },
  { label: 'Candidate pipeline active', ready: applications.value.length > 0, route: `/dashboard/jobs/${jobId}/candidates` },
])

const blockers = computed(() => readiness.value.filter(item => !item.ready))

const filteredCandidates = computed(() => {
  const term = searchTerm.value.trim().toLowerCase()
  const rows = [...applications.value].sort((a, b) => new Date(a.lastMovementAt ?? a.createdAt).getTime() - new Date(b.lastMovementAt ?? b.createdAt).getTime())
  if (!term) return rows.slice(0, 8)
  return rows.filter(app => `${app.candidateFirstName ?? ''} ${app.candidateLastName ?? ''} ${app.candidateEmail ?? ''} ${app.recruitmentStatus ?? ''}`.toLowerCase().includes(term)).slice(0, 8)
})

function stageLabel(stage?: string | null) {
  const labels: Record<string, string> = {
    candidate_added: 'Candidate Added',
    resume_received: 'Resume Received',
    resume_reviewed: 'Resume Reviewed',
    recruiter_screening_pending: 'Screening Pending',
    recruiter_screening_completed: 'Screening Completed',
    hiring_manager_round_pending: 'Hiring Manager Pending',
    hiring_manager_round_completed: 'Hiring Manager Completed',
    hod_round_pending: 'HOD Pending',
    hod_round_completed: 'HOD Completed',
    hr_round_pending: 'HR Pending',
    hr_round_completed: 'HR Completed',
    hold_for_comparison: 'Hold for Comparison',
    reassess: 'Reassess',
    not_proceeding: 'Not Proceeding',
    offer_stage: 'Offer Stage',
    offer_accepted: 'Offer Accepted',
    offer_declined: 'Offer Declined',
    joined: 'Joined',
    closed: 'Closed',
  }
  return stage ? labels[stage] ?? stage.replaceAll('_', ' ') : 'Candidate Added'
}

function movementDays(app: any) {
  return daysBetween(app.lastMovementAt ?? app.createdAt) ?? 0
}

const quickActions = computed(() => [
  { label: 'Candidate Pipeline', description: `${applications.value.length} candidates`, route: `/dashboard/jobs/${jobId}/candidates` },
  { label: 'JD & Skill Matrix', description: profile.value?.skillMatrixApproved ? 'Approved' : 'Needs review', route: `/dashboard/jobs/${jobId}/jd-upload` },
  { label: 'Candidate Match', description: 'AI-assisted matching', route: `/dashboard/jobs/${jobId}/pds-ranking` },
  { label: 'Sourcing Toolkit', description: 'Build sourcing activity', route: `/dashboard/jobs/${jobId}/sourcing` },
  { label: 'Candidate Register', description: 'Requirement candidate record', route: `/dashboard/jobs/${jobId}/pds-register` },
  { label: 'Requirement Settings', description: 'Edit requirement details', route: `/dashboard/jobs/${jobId}/settings` },
])

useSeoMeta({ title: computed(() => jobData.value ? `Requirement Command Centre — ${jobData.value.title}` : 'Requirement Command Centre'), robots: 'noindex, nofollow' })
</script>

<template>
  <div>
    <JobSubNavActions :job-id="jobId" />

    <div v-if="isLoading" class="flex items-center justify-center py-20 text-sm text-surface-400">Loading requirement command centre…</div>
    <div v-else-if="jobError || requirementError || appError" class="rounded-2xl border border-danger-200 bg-danger-50 p-5 text-sm text-danger-700 dark:border-danger-900 dark:bg-danger-950/30 dark:text-danger-300">Requirement workspace could not be loaded.</div>

    <template v-else-if="jobData && profile">
      <section class="mb-5 rounded-3xl bg-[#102A43] px-6 py-6 text-white shadow-sm sm:px-7" data-testid="requirement-command-centre">
        <div class="flex flex-wrap items-start justify-between gap-5">
          <div class="max-w-3xl">
            <p class="text-xs font-semibold uppercase tracking-[0.16em] text-[#9FD3F2]">Requirement Command Centre</p>
            <h1 class="mt-2 text-2xl font-bold tracking-tight">{{ jobData.title }}</h1>
            <div class="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[#D5E6F3]">
              <span v-if="profile.location" class="inline-flex items-center gap-1.5"><MapPin class="size-3.5" />{{ profile.location }}</span>
              <span v-if="profile.hiringManager" class="inline-flex items-center gap-1.5"><UserCheck class="size-3.5" />{{ profile.hiringManager }}</span>
              <span class="inline-flex items-center gap-1.5"><Users class="size-3.5" />{{ profile.openings ?? '—' }} opening{{ profile.openings === 1 ? '' : 's' }}</span>
            </div>
          </div>
          <NuxtLink :to="localePath(`/dashboard/jobs/${jobId}/candidates`)" class="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#102A43]">Open Candidate Pipeline <ArrowRight class="size-4" /></NuxtLink>
        </div>
      </section>

      <section class="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div class="rounded-2xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900">
          <p class="text-[11px] font-semibold uppercase tracking-wide text-surface-400">Recruiter Allocation</p>
          <p class="mt-2 text-xl font-bold" :class="profile.allocated ? 'text-success-700 dark:text-success-300' : 'text-warning-700 dark:text-warning-300'">{{ profile.allocated ? 'Allocated' : 'Not Allocated' }}</p>
          <p class="mt-1 text-xs text-surface-500">{{ profile.assignmentDate ? `TAT started ${new Date(profile.assignmentDate).toLocaleDateString()}` : 'TAT has not started' }}</p>
        </div>
        <div class="rounded-2xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900">
          <p class="text-[11px] font-semibold uppercase tracking-wide text-surface-400">TAT</p>
          <p class="mt-2 text-2xl font-bold text-[#102A43] dark:text-white">{{ tatDays ?? '—' }}<span v-if="tatDays != null" class="ml-1 text-sm font-medium text-surface-400">days</span></p>
          <p class="mt-1 text-xs text-surface-500">From recruiter allocation date</p>
        </div>
        <div class="rounded-2xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900">
          <p class="text-[11px] font-semibold uppercase tracking-wide text-surface-400">Closure Health</p>
          <p class="mt-2 text-lg font-bold" :class="daysToClosure != null && daysToClosure < 0 ? 'text-danger-700 dark:text-danger-300' : daysToClosure != null && daysToClosure <= 7 ? 'text-warning-700 dark:text-warning-300' : 'text-[#102A43] dark:text-white'">{{ closureRisk }}</p>
          <p class="mt-1 text-xs text-surface-500">{{ profile.closureDate ? `Target ${new Date(profile.closureDate).toLocaleDateString()}` : 'Target date not recorded' }}</p>
        </div>
        <div class="rounded-2xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900">
          <p class="text-[11px] font-semibold uppercase tracking-wide text-surface-400">Active Candidates</p>
          <p class="mt-2 text-2xl font-bold text-[#102A43] dark:text-white">{{ activeApplications.length }}</p>
          <p class="mt-1 text-xs text-surface-500">{{ applications.length }} total linked candidates</p>
        </div>
        <div class="rounded-2xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900">
          <p class="text-[11px] font-semibold uppercase tracking-wide text-surface-400">Readiness Blockers</p>
          <p class="mt-2 text-2xl font-bold" :class="blockers.length ? 'text-warning-700 dark:text-warning-300' : 'text-success-700 dark:text-success-300'">{{ blockers.length }}</p>
          <p class="mt-1 text-xs text-surface-500">{{ blockers.length ? 'Items need attention' : 'Requirement ready for execution' }}</p>
        </div>
      </section>

      <section class="mb-5 grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
        <div class="rounded-2xl border border-surface-200 bg-white p-5 dark:border-surface-800 dark:bg-surface-900">
          <div class="flex items-center justify-between gap-3">
            <div><h2 class="text-base font-bold text-[#102A43] dark:text-white">Hiring Pipeline</h2><p class="mt-1 text-xs text-surface-500">Current requirement movement at a glance.</p></div>
            <NuxtLink :to="localePath(`/dashboard/jobs/${jobId}/candidates`)" class="text-xs font-semibold text-brand-600">View full pipeline</NuxtLink>
          </div>
          <div class="mt-4 grid gap-3 sm:grid-cols-5">
            <div class="rounded-xl bg-surface-50 p-3 dark:bg-surface-800/50"><p class="text-[10px] font-semibold uppercase text-surface-400">New / Intake</p><p class="mt-1 text-xl font-bold">{{ applications.filter(a => ['candidate_added','resume_received','resume_reviewed', null, undefined].includes(a.recruitmentStatus)).length }}</p></div>
            <div class="rounded-xl bg-surface-50 p-3 dark:bg-surface-800/50"><p class="text-[10px] font-semibold uppercase text-surface-400">Screening</p><p class="mt-1 text-xl font-bold">{{ screeningApplications.length }}</p></div>
            <div class="rounded-xl bg-surface-50 p-3 dark:bg-surface-800/50"><p class="text-[10px] font-semibold uppercase text-surface-400">Interview</p><p class="mt-1 text-xl font-bold">{{ interviewApplications.length }}</p></div>
            <div class="rounded-xl bg-surface-50 p-3 dark:bg-surface-800/50"><p class="text-[10px] font-semibold uppercase text-surface-400">Offer</p><p class="mt-1 text-xl font-bold">{{ offerApplications.length }}</p></div>
            <div class="rounded-xl bg-success-50 p-3 dark:bg-success-950/30"><p class="text-[10px] font-semibold uppercase text-success-600">Joined</p><p class="mt-1 text-xl font-bold text-success-700 dark:text-success-300">{{ joinedApplications.length }}</p></div>
          </div>
        </div>

        <div class="rounded-2xl border border-surface-200 bg-white p-5 dark:border-surface-800 dark:bg-surface-900">
          <h2 class="text-base font-bold text-[#102A43] dark:text-white">Requirement Readiness</h2>
          <p class="mt-1 text-xs text-surface-500">Execution prerequisites and blockers.</p>
          <div class="mt-4 space-y-2">
            <NuxtLink v-for="item in readiness" :key="item.label" :to="localePath(item.route)" class="flex items-center justify-between gap-3 rounded-xl border border-surface-200 px-3 py-2.5 dark:border-surface-700">
              <span class="inline-flex items-center gap-2 text-sm font-medium text-surface-700 dark:text-surface-200"><CheckCircle2 v-if="item.ready" class="size-4 text-success-600" /><AlertTriangle v-else class="size-4 text-warning-600" />{{ item.label }}</span>
              <span class="text-xs font-semibold" :class="item.ready ? 'text-success-600' : 'text-warning-600'">{{ item.ready ? 'Ready' : 'Action needed' }}</span>
            </NuxtLink>
          </div>
        </div>
      </section>

      <section class="mb-5 rounded-2xl border border-surface-200 bg-white p-5 dark:border-surface-800 dark:bg-surface-900">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div><h2 class="text-base font-bold text-[#102A43] dark:text-white">Recruitment Actions</h2><p class="mt-1 text-xs text-surface-500">Move directly to the work area you need.</p></div>
        </div>
        <div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <NuxtLink v-for="action in quickActions" :key="action.label" :to="localePath(action.route)" class="group rounded-xl border border-surface-200 p-4 transition hover:border-brand-300 hover:shadow-sm dark:border-surface-700">
            <div class="flex items-center justify-between gap-3"><p class="text-sm font-bold text-[#102A43] dark:text-white">{{ action.label }}</p><ArrowRight class="size-4 text-surface-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500" /></div>
            <p class="mt-1 text-xs text-surface-500">{{ action.description }}</p>
          </NuxtLink>
        </div>
      </section>

      <section class="rounded-2xl border border-surface-200 bg-white p-5 dark:border-surface-800 dark:bg-surface-900">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div><h2 class="text-base font-bold text-[#102A43] dark:text-white">Candidates Needing Attention</h2><p class="mt-1 text-xs text-surface-500">Oldest stage movement appears first.</p></div>
          <div class="relative w-full sm:w-72"><Search class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-surface-400" /><input v-model="searchTerm" class="w-full rounded-xl border border-surface-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-400 dark:border-surface-700 dark:bg-surface-900" placeholder="Search candidates" /></div>
        </div>

        <div v-if="filteredCandidates.length" class="mt-4 divide-y divide-surface-100 dark:divide-surface-800">
          <NuxtLink v-for="app in filteredCandidates" :key="app.id" :to="localePath(`/dashboard/recruitment/${app.id}`)" class="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-semibold text-surface-900 dark:text-white">{{ formatPersonName(app.candidateFirstName, app.candidateLastName) }}</p>
              <p class="mt-0.5 truncate text-xs text-surface-400">{{ app.candidateEmail }}</p>
            </div>
            <span class="rounded-full bg-surface-100 px-2.5 py-1 text-[10px] font-semibold text-surface-600 dark:bg-surface-800 dark:text-surface-300">{{ stageLabel(app.recruitmentStatus) }}</span>
            <span class="inline-flex items-center gap-1 text-xs font-semibold" :class="movementDays(app) >= 7 ? 'text-danger-600' : movementDays(app) >= 3 ? 'text-warning-600' : 'text-surface-500'"><Clock3 class="size-3.5" />{{ movementDays(app) }}d in stage</span>
            <span class="min-w-[180px] max-w-sm truncate text-xs text-surface-500">{{ app.nextAction || 'Open workspace for next action' }}</span>
            <ArrowRight class="size-4 text-surface-300" />
          </NuxtLink>
        </div>
        <div v-else class="mt-4 rounded-xl border border-dashed border-surface-300 p-8 text-center text-sm text-surface-500 dark:border-surface-700">No candidates match this requirement view.</div>
      </section>
    </template>
  </div>
</template>