<script setup lang="ts">
import { AlertTriangle, ArrowRight, Clock3, Mail, Search, UserRound, Users } from '@lucide/vue'

definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'require-org'],
})

const route = useRoute()
const jobId = route.params.id as string
const { formatPersonName } = useOrgSettings()

const { data: jobData, status: jobFetchStatus, error: jobError } = useFetch(
  () => `/api/jobs/${jobId}`,
  {
    key: `candidates-job-${jobId}`,
    headers: useRequestHeaders(['cookie']),
  },
)

useSeoMeta({
  title: computed(() => jobData.value ? `Candidate Pipeline — ${jobData.value.title}` : 'Candidate Pipeline'),
})

const { data: appData, status: appFetchStatus, error: appError, refresh: refreshApps } = useFetch('/api/applications', {
  key: `candidate-pipeline-apps-${jobId}`,
  query: computed(() => ({ jobId, limit: 100 })),
  headers: useRequestHeaders(['cookie']),
})

const applications = computed(() => appData.value?.data ?? [])
const total = computed(() => appData.value?.total ?? 0)
const search = ref('')
const selectedStage = ref('all')
const selectedAppId = ref<string | null>(null)
const sidebarOpen = computed(() => Boolean(selectedAppId.value))
const isLoading = computed(() => jobFetchStatus.value === 'pending' || appFetchStatus.value === 'pending')

const stageGroups = [
  { key: 'intake', label: 'New / Intake', description: 'Resume received and initial review' },
  { key: 'screening', label: 'Recruiter Screening', description: 'Recruiter validation and reassessment' },
  { key: 'interview', label: 'Interview', description: 'Hiring Manager, HOD and HR rounds' },
  { key: 'offer', label: 'Offer', description: 'Offer preparation and candidate decision' },
  { key: 'joined', label: 'Joined', description: 'Successful joining' },
  { key: 'closed', label: 'Closed', description: 'Closed or not proceeding' },
] as const

type StageGroupKey = typeof stageGroups[number]['key']

function stageGroup(stage?: string | null): StageGroupKey {
  if (!stage || ['candidate_added', 'resume_received', 'resume_reviewed'].includes(stage)) return 'intake'
  if (['recruiter_screening_pending', 'recruiter_screening_completed', 'reassess', 'hold_for_comparison'].includes(stage)) return 'screening'
  if (stage.startsWith('hiring_manager_') || stage.startsWith('hod_') || stage.startsWith('hr_')) return 'interview'
  if (['offer_stage', 'offer_accepted', 'offer_declined'].includes(stage)) return 'offer'
  if (stage === 'joined') return 'joined'
  return 'closed'
}

function stageLabel(stage?: string | null) {
  const labels: Record<string, string> = {
    candidate_added: 'Candidate Added',
    resume_received: 'Resume Received',
    resume_reviewed: 'Resume Reviewed',
    recruiter_screening_pending: 'Screening Pending',
    recruiter_screening_completed: 'Screening Completed',
    reassess: 'Reassess',
    hold_for_comparison: 'Hold for Comparison',
    hiring_manager_round_pending: 'Hiring Manager Pending',
    hiring_manager_round_completed: 'Hiring Manager Completed',
    hod_round_pending: 'HOD Pending',
    hod_round_completed: 'HOD Completed',
    hr_round_pending: 'HR Pending',
    hr_round_completed: 'HR Completed',
    offer_stage: 'Offer Stage',
    offer_accepted: 'Offer Accepted',
    offer_declined: 'Offer Declined',
    joined: 'Joined',
    not_proceeding: 'Not Proceeding',
    closed: 'Closed',
  }
  return stage ? (labels[stage] ?? stage.replaceAll('_', ' ')) : 'Candidate Added'
}

function getCandidateInitials(firstName?: string, lastName?: string) {
  const first = firstName?.trim().charAt(0) ?? ''
  const last = lastName?.trim().charAt(0) ?? ''
  return `${first}${last}`.toUpperCase() || 'C'
}

function movementDays(value: string | Date) {
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86400000))
}

function movementText(value: string | Date) {
  const days = movementDays(value)
  if (days === 0) return 'Moved today'
  if (days === 1) return '1 day in stage'
  return `${days} days in stage`
}

function movementClass(value: string | Date) {
  const days = movementDays(value)
  if (days >= 7) return 'text-danger-700 bg-danger-50 ring-danger-200 dark:bg-danger-950/40 dark:text-danger-300 dark:ring-danger-900'
  if (days >= 3) return 'text-warning-700 bg-warning-50 ring-warning-200 dark:bg-warning-950/40 dark:text-warning-300 dark:ring-warning-900'
  return 'text-surface-600 bg-surface-100 ring-surface-200 dark:bg-surface-800 dark:text-surface-300 dark:ring-surface-700'
}

function fitLabel(fit?: string | null) {
  if (!fit) return 'Fit not assessed'
  return fit.replaceAll('_', ' ')
}

const filteredApplications = computed(() => {
  const query = search.value.trim().toLowerCase()
  return applications.value.filter((app) => {
    if (selectedStage.value !== 'all' && stageGroup(app.recruitmentStatus) !== selectedStage.value) return false
    if (!query) return true
    const haystack = [app.candidateFirstName, app.candidateLastName, app.candidateEmail, app.recruitmentStatus, app.nextAction]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return haystack.includes(query)
  })
})

const pipelineGroups = computed(() => stageGroups.map(group => ({
  ...group,
  applications: filteredApplications.value
    .filter(app => stageGroup(app.recruitmentStatus) === group.key)
    .sort((a, b) => new Date(a.lastMovementAt).getTime() - new Date(b.lastMovementAt).getTime()),
})))

const attentionCount = computed(() => applications.value.filter(app => {
  const group = stageGroup(app.recruitmentStatus)
  return !['joined', 'closed'].includes(group) && movementDays(app.lastMovementAt) >= 3
}).length)

const interviewCount = computed(() => applications.value.filter(app => stageGroup(app.recruitmentStatus) === 'interview').length)
const offerCount = computed(() => applications.value.filter(app => stageGroup(app.recruitmentStatus) === 'offer').length)

function selectCandidate(appId: string) {
  selectedAppId.value = appId
}

function closeSidebar() {
  selectedAppId.value = null
}

async function handleSidebarUpdated() {
  await refreshApps()
}
</script>

<template>
  <div>
    <JobSubNavActions :job-id="jobId" />

    <div v-if="isLoading" class="flex flex-col items-center justify-center gap-3 py-16">
      <div class="size-8 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600 dark:border-brand-800 dark:border-t-brand-400" />
      <p class="text-sm font-medium text-surface-400">Loading candidate pipeline…</p>
    </div>

    <div v-else-if="jobError || appError" class="rounded-2xl border border-danger-200 bg-danger-50 p-5 text-sm text-danger-700 dark:border-danger-900 dark:bg-danger-950/30 dark:text-danger-300">
      {{ jobError ? 'Requirement not found or failed to load.' : 'Failed to load candidate pipeline.' }}
    </div>

    <template v-else-if="jobData">
      <section class="mb-5 rounded-3xl bg-[#102A43] px-6 py-6 text-white shadow-sm sm:px-7">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.16em] text-[#9FD3F2]">Candidate Pipeline</p>
            <h1 class="mt-2 text-2xl font-bold tracking-tight">{{ jobData.title }}</h1>
            <p class="mt-2 max-w-3xl text-sm text-[#D5E6F3]">Work candidates by governed recruitment stage. Fit information supports recruiter judgement; stage movement remains controlled through the recruiter workspace.</p>
          </div>
          <div class="grid grid-cols-3 gap-2 text-center">
            <div class="rounded-xl bg-white/10 px-4 py-3"><p class="text-xl font-bold">{{ total }}</p><p class="text-[11px] text-[#D5E6F3]">Candidates</p></div>
            <div class="rounded-xl bg-white/10 px-4 py-3"><p class="text-xl font-bold">{{ attentionCount }}</p><p class="text-[11px] text-[#D5E6F3]">Need Attention</p></div>
            <div class="rounded-xl bg-white/10 px-4 py-3"><p class="text-xl font-bold">{{ offerCount }}</p><p class="text-[11px] text-[#D5E6F3]">In Offer</p></div>
          </div>
        </div>
      </section>

      <section class="mb-5 grid gap-3 sm:grid-cols-3">
        <div class="rounded-2xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900">
          <p class="text-xs font-semibold uppercase tracking-wide text-surface-400">Active Pipeline</p>
          <p class="mt-2 text-2xl font-bold text-[#102A43] dark:text-white">{{ applications.filter(app => !['joined', 'closed'].includes(stageGroup(app.recruitmentStatus))).length }}</p>
          <p class="mt-1 text-xs text-surface-500">Candidates requiring recruitment movement</p>
        </div>
        <div class="rounded-2xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900">
          <p class="text-xs font-semibold uppercase tracking-wide text-surface-400">In Interview</p>
          <p class="mt-2 text-2xl font-bold text-[#102A43] dark:text-white">{{ interviewCount }}</p>
          <p class="mt-1 text-xs text-surface-500">Hiring Manager, HOD or HR stages</p>
        </div>
        <div class="rounded-2xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900">
          <p class="text-xs font-semibold uppercase tracking-wide text-surface-400">Stale 3+ Days</p>
          <p class="mt-2 text-2xl font-bold text-[#102A43] dark:text-white">{{ attentionCount }}</p>
          <p class="mt-1 text-xs text-surface-500">Active candidates without stage movement</p>
        </div>
      </section>

      <div class="mb-5 flex flex-wrap items-center gap-3">
        <div class="relative min-w-[260px] flex-1 sm:max-w-md">
          <Search class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-surface-400" />
          <input v-model="search" type="search" placeholder="Search candidate, email, stage or next action" class="w-full rounded-xl border border-surface-200 bg-white py-2.5 pl-9 pr-3 text-sm text-surface-900 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-surface-700 dark:bg-surface-900 dark:text-white dark:focus:ring-brand-900/40" />
        </div>
        <div class="flex flex-wrap gap-2">
          <button class="rounded-lg px-3 py-2 text-xs font-semibold" :class="selectedStage === 'all' ? 'bg-[#102A43] text-white' : 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-300'" @click="selectedStage = 'all'">All</button>
          <button v-for="group in stageGroups" :key="group.key" class="rounded-lg px-3 py-2 text-xs font-semibold" :class="selectedStage === group.key ? 'bg-[#102A43] text-white' : 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-300'" @click="selectedStage = group.key">{{ group.label }}</button>
        </div>
      </div>

      <div v-if="applications.length === 0" class="rounded-2xl border border-surface-200 bg-white p-12 text-center dark:border-surface-800 dark:bg-surface-900">
        <div class="mx-auto flex size-14 items-center justify-center rounded-2xl bg-surface-100 dark:bg-surface-800"><Users class="size-6 text-surface-400" /></div>
        <h2 class="mt-4 font-semibold text-surface-800 dark:text-surface-100">No candidates yet</h2>
        <p class="mx-auto mt-1 max-w-md text-sm text-surface-500">Candidates will appear here after they apply or are linked to this requirement.</p>
      </div>

      <div v-else class="grid gap-4 xl:grid-cols-3 2xl:grid-cols-6" data-testid="candidate-pipeline-board">
        <section v-for="group in pipelineGroups" :key="group.key" class="min-w-0 rounded-2xl border border-surface-200 bg-surface-50/70 dark:border-surface-800 dark:bg-surface-900/60">
          <header class="border-b border-surface-200 px-4 py-3 dark:border-surface-800">
            <div class="flex items-center justify-between gap-2">
              <h2 class="text-sm font-bold text-[#102A43] dark:text-white">{{ group.label }}</h2>
              <span class="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-surface-600 shadow-sm dark:bg-surface-800 dark:text-surface-300">{{ group.applications.length }}</span>
            </div>
            <p class="mt-1 text-[11px] leading-4 text-surface-400">{{ group.description }}</p>
          </header>

          <div class="max-h-[68vh] space-y-3 overflow-y-auto p-3">
            <button v-for="app in group.applications" :key="app.id" type="button" class="w-full rounded-xl border border-surface-200 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md dark:border-surface-700 dark:bg-surface-950" data-testid="candidate-pipeline-card" @click="selectCandidate(app.id)">
              <div class="flex items-start gap-3">
                <div class="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#EAF4FA] text-xs font-bold text-[#1F6FA3] dark:bg-surface-800 dark:text-brand-300">{{ getCandidateInitials(app.candidateFirstName, app.candidateLastName) }}</div>
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-bold text-[#102A43] dark:text-white">{{ formatPersonName(app.candidateFirstName, app.candidateLastName) }}</p>
                  <p class="mt-0.5 truncate text-[11px] text-surface-400"><Mail class="mr-1 inline size-3" />{{ app.candidateEmail }}</p>
                </div>
              </div>

              <div class="mt-3 flex flex-wrap gap-1.5">
                <span class="rounded-md bg-[#EAF4FA] px-2 py-1 text-[10px] font-semibold capitalize text-[#1F6FA3] dark:bg-surface-800 dark:text-brand-300" data-testid="candidate-current-stage">{{ stageLabel(app.recruitmentStatus) }}</span>
                <span v-if="app.priority" class="rounded-md bg-surface-100 px-2 py-1 text-[10px] font-semibold capitalize text-surface-600 ring-1 ring-inset ring-surface-200 dark:bg-surface-800 dark:text-surface-300 dark:ring-surface-700">{{ app.priority }} priority</span>
              </div>

              <div class="mt-3 flex items-center justify-between gap-2">
                <span class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold ring-1 ring-inset" :class="movementClass(app.lastMovementAt)" data-testid="candidate-stage-age"><Clock3 class="size-3" />{{ movementText(app.lastMovementAt) }}</span>
                <span class="text-[10px] font-medium capitalize text-surface-500">{{ fitLabel(app.currentFit) }}</span>
              </div>

              <div class="mt-3 rounded-lg bg-surface-50 p-2.5 dark:bg-surface-900" data-testid="candidate-next-action">
                <p class="text-[10px] font-semibold uppercase tracking-wide text-surface-400">Next Action</p>
                <p class="mt-1 line-clamp-2 text-xs font-medium leading-4 text-surface-700 dark:text-surface-200">{{ app.nextAction || 'Open candidate and confirm the next governed recruitment action.' }}</p>
              </div>

              <div v-if="app.mainGap || app.keyStrength" class="mt-3 border-t border-surface-100 pt-2.5 text-[11px] dark:border-surface-800">
                <p v-if="app.keyStrength" class="line-clamp-1 text-surface-500"><span class="font-semibold text-surface-600 dark:text-surface-300">Strength:</span> {{ app.keyStrength }}</p>
                <p v-if="app.mainGap" class="mt-1 line-clamp-1 text-surface-500"><span class="font-semibold text-surface-600 dark:text-surface-300">Review:</span> {{ app.mainGap }}</p>
              </div>

              <div class="mt-3 flex items-center justify-between border-t border-surface-100 pt-2.5 dark:border-surface-800">
                <span v-if="movementDays(app.lastMovementAt) >= 3 && !['joined', 'closed'].includes(stageGroup(app.recruitmentStatus))" class="inline-flex items-center gap-1 text-[10px] font-semibold text-warning-700 dark:text-warning-300"><AlertTriangle class="size-3" />Follow-up due</span>
                <span v-else class="inline-flex items-center gap-1 text-[10px] text-surface-400"><UserRound class="size-3" />Recruiter workspace</span>
                <span class="inline-flex items-center gap-1 text-[10px] font-semibold text-brand-600 dark:text-brand-400">Open <ArrowRight class="size-3" /></span>
              </div>
            </button>

            <div v-if="group.applications.length === 0" class="rounded-xl border border-dashed border-surface-200 px-3 py-8 text-center text-xs text-surface-400 dark:border-surface-700">No candidates in this stage.</div>
          </div>
        </section>
      </div>
    </template>

    <PdsRecruiterCandidateWorkspace v-if="selectedAppId" :application-id="selectedAppId" :open="sidebarOpen" @close="closeSidebar" @updated="handleSidebarUpdated" />
  </div>
</template>
