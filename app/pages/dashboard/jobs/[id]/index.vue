<script setup lang="ts">
import { ArrowRight, BrainCircuit, Briefcase, Clock, Mail, Search, UserPlus, UserRound } from 'lucide-vue-next'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'require-org'] })

const route = useRoute()
const localePath = useLocalePath()
const jobId = route.params.id as string
const { formatPersonName } = useOrgSettings()
const { job: jobData, status: jobFetchStatus, error: jobError } = useJob(jobId)

const { data: appData, status: appFetchStatus, error: appError, refresh: refreshApps } = useFetch('/api/applications', {
  key: `pipeline-apps-${jobId}`,
  query: { jobId, limit: 100 },
  headers: useRequestHeaders(['cookie']),
})

const applications = computed<any[]>(() => appData.value?.data ?? [])
const searchTerm = ref('')
const selectedId = ref<string | null>(null)

const filteredApplications = computed(() => {
  const term = searchTerm.value.trim().toLowerCase()
  if (!term) return applications.value
  return applications.value.filter(app => {
    const name = `${app.candidateFirstName ?? ''} ${app.candidateLastName ?? ''}`.toLowerCase()
    return name.includes(term) || (app.candidateEmail ?? '').toLowerCase().includes(term)
  })
})

watch(filteredApplications, (rows) => {
  if (!rows.length) {
    selectedId.value = null
    return
  }
  if (!selectedId.value || !rows.some(row => row.id === selectedId.value)) selectedId.value = rows[0].id
}, { immediate: true })

const selected = computed(() => filteredApplications.value.find(row => row.id === selectedId.value) ?? filteredApplications.value[0] ?? null)
const isLoading = computed(() => jobFetchStatus.value === 'pending' || appFetchStatus.value === 'pending')

const stageLabels: Record<string, string> = {
  candidate_added: 'Candidate Added',
  resume_received: 'Resume Received',
  resume_reviewed: 'Resume Assessed',
  recruiter_screening_pending: 'Recruiter Screening In Progress',
  recruiter_screening_completed: 'Recruiter Screening Completed',
  hiring_manager_round_pending: 'Hiring Manager Pending',
  hiring_manager_round_completed: 'Hiring Manager Completed',
  hod_round_pending: 'HOD Pending',
  hod_round_completed: 'HOD Completed',
  hr_round_pending: 'HR Pending',
  hr_round_completed: 'HR Completed',
  hold_for_comparison: 'Hold for Comparison',
  reassess: 'Reassessment Required',
  not_proceeding: 'Not Proceeding',
  offer_stage: 'Offer Stage',
  offer_accepted: 'Offer Accepted',
  offer_declined: 'Offer Declined',
  joined: 'Joined',
  closed: 'Closed',
}

const fitLabels: Record<string, string> = {
  not_yet_assessed: 'Not Yet Assessed',
  strong_fit: 'Strong Fit',
  potential_fit: 'Potential Fit',
  borderline_requires_validation: 'Borderline / Requires Validation',
  significant_gap: 'Significant Gap',
}

function initials(first?: string, last?: string) {
  return `${first?.trim()?.[0] ?? ''}${last?.trim()?.[0] ?? ''}`.toUpperCase() || 'C'
}

function timeAgo(date: string | Date) {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.max(0, Math.floor(diff / 60_000))
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

useSeoMeta({ title: computed(() => jobData.value ? `Recruitment Pipeline — ${jobData.value.title}` : 'Recruitment Pipeline'), robots: 'noindex, nofollow' })
</script>

<template>
  <div class="absolute inset-0 flex flex-col overflow-hidden bg-surface-50 dark:bg-surface-950">
    <div v-if="isLoading" class="flex flex-1 items-center justify-center text-sm text-surface-400">Loading recruitment pipeline…</div>
    <div v-else-if="jobError || appError" class="m-6 rounded-xl border border-danger-200 bg-danger-50 p-5 text-sm text-danger-700">{{ jobError ? 'Requirement could not be loaded.' : (appError?.data?.statusMessage ?? 'Candidate pipeline could not be loaded.') }}</div>

    <template v-else-if="jobData">
      <JobSubNavActions :job-id="jobId" />

      <div class="shrink-0 border-b border-surface-200 bg-white px-5 py-4 dark:border-surface-800 dark:bg-surface-900">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div class="flex items-center gap-2"><Briefcase class="size-4 text-[#2E86C1]" /><h1 class="text-lg font-bold text-[#102A43] dark:text-white">PDS Recruitment Pipeline</h1></div>
            <p class="mt-1 text-xs text-surface-500">{{ jobData.title }} · Manual recruiter calls and interview rounds are recorded here; scheduling is intentionally outside V1.</p>
          </div>
          <NuxtLink :to="localePath(`/dashboard/jobs/${jobId}/pds-ranking`)" class="inline-flex items-center gap-1.5 rounded-lg border border-[#9FC7DF] px-3 py-2 text-xs font-semibold text-[#1F6FA3]">AI Candidate Pool <ArrowRight class="size-3.5" /></NuxtLink>
        </div>
      </div>

      <div class="flex min-h-0 flex-1 overflow-hidden">
        <aside class="w-80 shrink-0 border-r border-surface-200 bg-white dark:border-surface-800 dark:bg-surface-900">
          <div class="border-b border-surface-100 p-3 dark:border-surface-800">
            <div class="relative"><Search class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-surface-400" /><input v-model="searchTerm" class="w-full rounded-lg border border-surface-200 bg-surface-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-surface-700 dark:bg-surface-800" placeholder="Search candidate…" /></div>
            <p class="mt-2 text-xs text-surface-400">{{ filteredApplications.length }} candidate{{ filteredApplications.length === 1 ? '' : 's' }}</p>
          </div>

          <div class="h-full overflow-y-auto pb-24">
            <button v-for="app in filteredApplications" :key="app.id" type="button" class="flex w-full items-start gap-3 border-b border-surface-100 px-4 py-3 text-left transition dark:border-surface-800" :class="selected?.id === app.id ? 'bg-brand-50 dark:bg-brand-950/25' : 'hover:bg-surface-50 dark:hover:bg-surface-800/50'" @click="selectedId = app.id">
              <div class="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#EAF4FB] text-xs font-bold text-[#1F6FA3]">{{ initials(app.candidateFirstName, app.candidateLastName) }}</div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-semibold text-surface-900 dark:text-surface-100">{{ formatPersonName(app.candidateFirstName, app.candidateLastName) }}</p>
                <p class="truncate text-xs text-surface-400">{{ app.candidateEmail }}</p>
                <div class="mt-2 flex flex-wrap gap-1.5"><span class="rounded-full bg-surface-100 px-2 py-0.5 text-[10px] font-semibold text-surface-600 dark:bg-surface-800 dark:text-surface-300">{{ stageLabels[app.recruitmentStatus] ?? app.recruitmentStatus ?? 'Candidate Added' }}</span><span v-if="app.priority" class="rounded-full bg-[#EAF4FB] px-2 py-0.5 text-[10px] font-bold text-[#1F6FA3]">{{ app.priority }}</span></div>
              </div>
            </button>

            <div v-if="!filteredApplications.length" class="px-5 py-12 text-center"><UserPlus class="mx-auto size-6 text-surface-300" /><p class="mt-2 text-sm font-medium text-surface-500">No candidates found</p><p class="mt-1 text-xs text-surface-400">Use Add Candidate above or move a candidate from the AI Candidate Pool.</p></div>
          </div>
        </aside>

        <main class="min-w-0 flex-1 overflow-y-auto p-5">
          <div v-if="!selected" class="flex h-full items-center justify-center text-center"><div><UserRound class="mx-auto size-10 text-surface-300" /><p class="mt-3 text-sm font-medium text-surface-500">Select a candidate to review the recruitment workflow.</p></div></div>

          <div v-else class="mx-auto max-w-4xl space-y-5">
            <section class="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm dark:border-surface-800 dark:bg-surface-900">
              <div class="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 class="text-xl font-bold text-[#102A43] dark:text-white">{{ formatPersonName(selected.candidateFirstName, selected.candidateLastName) }}</h2>
                  <a :href="`mailto:${selected.candidateEmail}`" class="mt-1 inline-flex items-center gap-1.5 text-sm text-brand-600 hover:underline"><Mail class="size-3.5" />{{ selected.candidateEmail }}</a>
                </div>
                <NuxtLink :to="localePath(`/dashboard/applications/${selected.id}#recruiter-screening`)" class="inline-flex items-center gap-2 rounded-lg bg-[#16847F] px-4 py-2 text-sm font-semibold text-white"><BrainCircuit class="size-4" />Open Recruitment Workspace</NuxtLink>
              </div>

              <div class="mt-4 grid gap-3 sm:grid-cols-4">
                <div class="rounded-lg bg-surface-50 p-3 dark:bg-surface-800/50"><p class="text-[10px] font-bold uppercase tracking-wide text-surface-400">Stage</p><p class="mt-1 text-sm font-semibold text-surface-800 dark:text-white">{{ stageLabels[selected.recruitmentStatus] ?? selected.recruitmentStatus ?? 'Candidate Added' }}</p></div>
                <div class="rounded-lg bg-surface-50 p-3 dark:bg-surface-800/50"><p class="text-[10px] font-bold uppercase tracking-wide text-surface-400">Current Fit</p><p class="mt-1 text-sm font-semibold text-surface-800 dark:text-white">{{ fitLabels[selected.currentFit] ?? selected.currentFit ?? 'Not Yet Assessed' }}</p></div>
                <div class="rounded-lg bg-surface-50 p-3 dark:bg-surface-800/50"><p class="text-[10px] font-bold uppercase tracking-wide text-surface-400">AI Match</p><p class="mt-1 text-sm font-semibold text-surface-800 dark:text-white">{{ selected.provisionalFitScore != null ? `${selected.provisionalFitScore}/100` : 'Pending' }}</p></div>
                <div class="rounded-lg bg-surface-50 p-3 dark:bg-surface-800/50"><p class="text-[10px] font-bold uppercase tracking-wide text-surface-400">Priority</p><p class="mt-1 text-sm font-semibold text-surface-800 dark:text-white">{{ selected.priority ?? 'Pending' }}</p></div>
              </div>

              <div v-if="selected.nextAction" class="mt-3 flex items-start gap-2 rounded-lg border border-surface-200 px-3 py-2 text-xs text-surface-600 dark:border-surface-700 dark:text-surface-300"><Clock class="mt-0.5 size-3.5 shrink-0 text-surface-400" /><span><strong>Next action:</strong> {{ selected.nextAction }}</span></div>
            </section>

            <ScoreBreakdown :application-id="selected.id" @scored="refreshApps()" />

            <section class="rounded-xl border border-[#D7E9E7] bg-[#F4FBFA] p-4 dark:border-surface-700 dark:bg-surface-900">
              <h3 class="text-sm font-semibold text-[#102A43] dark:text-white">Manual recruiter and interview process</h3>
              <p class="mt-1 text-xs leading-5 text-surface-500">There is no interview scheduler in the PDS V1 workflow. Open the Recruitment Workspace to prepare/edit recruiter screening questions, record the direct candidate call, capture Hiring Manager/HOD/HR evidence, and progress the candidate through the controlled stages.</p>
              <NuxtLink :to="localePath(`/dashboard/applications/${selected.id}#recruiter-screening`)" class="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#16847F] hover:underline">Prepare Recruiter Screening <ArrowRight class="size-3.5" /></NuxtLink>
            </section>
          </div>
        </main>
      </div>
    </template>
  </div>
</template>
