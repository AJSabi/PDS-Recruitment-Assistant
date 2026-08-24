<script setup lang="ts">
import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardList, FileSearch, Loader2, RefreshCw, Sparkles, UsersRound } from 'lucide-vue-next'
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'require-org'] })
const route = useRoute()
const jobId = route.params.id as string
const localePath = useLocalePath()
const toast = useToast()
const { job } = useJob(jobId)
const { data, status, refresh } = useFetch(() => `/api/jobs/${jobId}/batch-ranking`, {
  key: `pds-batch-ranking-${jobId}`,
  headers: useRequestHeaders(['cookie']),
})

const batchBusy = ref(false)
const batchProgress = ref({ done: 0, total: 0 })
const rows = computed<any[]>(() => data.value?.ranking ?? [])
const summary = computed(() => ({
  total: rows.value.length,
  assessed: rows.value.filter(row => row.assessed).length,
  needsReassessment: rows.value.filter(row => row.needsReassessment).length,
  notYetAssessed: rows.value.filter(row => row.currentFit === 'not_yet_assessed').length,
}))
const batchEligible = computed(() => rows.value.filter(row => row.selectedResume && !row.assessed && row.lastStatus === 'resume_received'))

function label(value?: string | null) {
  return (value ?? '—').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
}

async function analyzePendingWithAi() {
  const candidates = batchEligible.value
  if (!candidates.length) return toast.warning('No candidates ready', 'Select a resume for each candidate and ensure the approved Skill Matrix is available.')
  batchBusy.value = true
  batchProgress.value = { done: 0, total: candidates.length }
  let succeeded = 0
  const failures: string[] = []
  for (const candidate of candidates) {
    try {
      await $fetch(`/api/applications/${candidate.applicationId}/resume-assessment/generate`, { method: 'POST' })
      succeeded++
    } catch (err: any) {
      failures.push(`${candidate.candidate}: ${err?.data?.statusMessage ?? err?.message ?? 'Analysis failed'}`)
    } finally {
      batchProgress.value.done++
    }
  }
  await refresh()
  batchBusy.value = false
  if (failures.length) toast.warning('Batch AI analysis completed with exceptions', `${succeeded} completed; ${failures.length} need review.`)
  else toast.success('Batch AI analysis completed', { message: `${succeeded} candidates assessed and ranked.` })
}
</script>

<template>
  <div class="mx-auto max-w-7xl">
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <NuxtLink :to="localePath(`/dashboard/jobs/${jobId}`)" class="inline-flex items-center gap-1.5 rounded-lg border border-surface-300 px-3 py-1.5 text-sm font-medium text-surface-600 hover:border-brand-400 hover:text-brand-700 dark:border-surface-700 dark:text-surface-300"><ArrowLeft class="size-4" />Pipeline</NuxtLink>
      <NuxtLink :to="localePath(`/dashboard/jobs/${jobId}/ai-analysis`)" class="inline-flex items-center gap-1.5 rounded-lg border border-surface-300 px-3 py-1.5 text-sm font-medium text-surface-600 hover:border-brand-400 hover:text-brand-700 dark:border-surface-700 dark:text-surface-300"><FileSearch class="size-4" />JD & Skill Matrix</NuxtLink>
      <NuxtLink :to="localePath(`/dashboard/jobs/${jobId}/pds-register`)" class="inline-flex items-center gap-1.5 rounded-lg border border-surface-300 px-3 py-1.5 text-sm font-medium text-surface-600 hover:border-brand-400 hover:text-brand-700 dark:border-surface-700 dark:text-surface-300"><UsersRound class="size-4" />Candidate Register</NuxtLink>
    </div>

    <header class="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-xs font-medium uppercase tracking-wide text-surface-400">PDS Recruitment Work Queue</p>
        <h1 class="mt-1 text-2xl font-bold">{{ job?.title ?? 'Requirement' }}</h1>
        <p class="mt-1 text-sm text-surface-500">AI resume analysis ranks candidates against the approved Skill Matrix before recruiter screening.</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button :disabled="batchBusy || !batchEligible.length" class="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40" @click="analyzePendingWithAi"><Loader2 v-if="batchBusy" class="size-4 animate-spin" /><Sparkles v-else class="size-4" />{{ batchBusy ? `Analyzing ${batchProgress.done}/${batchProgress.total}` : `Analyze Pending with AI (${batchEligible.length})` }}</button>
        <button class="inline-flex items-center gap-2 rounded-lg border border-surface-300 px-3 py-2 text-sm font-medium" @click="refresh"><RefreshCw class="size-4" />Refresh</button>
      </div>
    </header>

    <div v-if="status === 'pending'" class="py-10 text-center text-surface-400">Loading work queue…</div>
    <template v-else>
      <div class="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div class="rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900"><div class="flex items-center gap-2 text-surface-500"><UsersRound class="size-4" /><span class="text-xs font-medium uppercase tracking-wide">Candidates</span></div><p class="mt-2 text-2xl font-bold text-surface-900 dark:text-surface-50">{{ summary.total }}</p></div>
        <div class="rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900"><div class="flex items-center gap-2 text-success-600"><CheckCircle2 class="size-4" /><span class="text-xs font-medium uppercase tracking-wide">Resume Assessed</span></div><p class="mt-2 text-2xl font-bold text-surface-900 dark:text-surface-50">{{ summary.assessed }}</p></div>
        <div class="rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900"><div class="flex items-center gap-2 text-surface-500"><ClipboardList class="size-4" /><span class="text-xs font-medium uppercase tracking-wide">Not Yet Assessed</span></div><p class="mt-2 text-2xl font-bold text-surface-900 dark:text-surface-50">{{ summary.notYetAssessed }}</p></div>
        <div class="rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900"><div class="flex items-center gap-2 text-warning-600"><AlertTriangle class="size-4" /><span class="text-xs font-medium uppercase tracking-wide">Reassessment Required</span></div><p class="mt-2 text-2xl font-bold text-surface-900 dark:text-surface-50">{{ summary.needsReassessment }}</p></div>
      </div>

      <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white dark:border-surface-800 dark:bg-surface-900">
        <table class="min-w-full text-sm">
          <thead class="bg-surface-50 text-left text-xs uppercase tracking-wide text-surface-500 dark:bg-surface-800/60"><tr><th class="px-4 py-3">Rank</th><th class="px-4 py-3">Candidate</th><th class="px-4 py-3">Priority</th><th class="px-4 py-3">Score</th><th class="px-4 py-3">Current Fit</th><th class="px-4 py-3">Recruitment Status</th><th class="px-4 py-3">Next Action</th><th class="px-4 py-3">Main Gap</th></tr></thead>
          <tbody class="divide-y divide-surface-100 dark:divide-surface-800">
            <tr v-for="row in rows" :key="row.applicationId" class="hover:bg-surface-50 dark:hover:bg-surface-800/30">
              <td class="px-4 py-3 font-semibold">{{ row.rank }}</td>
              <td class="px-4 py-3 min-w-[220px]"><NuxtLink :to="localePath(`/dashboard/recruitment/${row.applicationId}`)" class="inline-flex items-center gap-1.5 font-semibold text-brand-600 hover:underline"><ClipboardList class="size-3.5" />{{ row.candidate }}</NuxtLink><div class="text-xs text-surface-400">{{ row.email }}</div><div v-if="row.needsReassessment" class="mt-1 text-xs font-semibold text-warning-600">Requirement changed — reassessment required</div><div v-else-if="row.selectedResume && !row.assessed" class="mt-1 text-xs text-brand-600">Ready for AI resume analysis</div></td>
              <td class="px-4 py-3 font-semibold">{{ row.priority ?? '—' }}</td><td class="px-4 py-3">{{ row.provisionalFitScore ?? '—' }}</td><td class="px-4 py-3 min-w-[150px]">{{ label(row.currentFit) }}</td><td class="px-4 py-3 min-w-[170px]">{{ label(row.lastStatus) }}</td><td class="px-4 py-3 min-w-[250px] font-medium text-surface-700 dark:text-surface-200">{{ row.nextAction ?? 'Open recruitment workflow' }}</td><td class="px-4 py-3 min-w-[200px]">{{ row.mainGap ?? '—' }}</td>
            </tr>
            <tr v-if="!rows.length"><td colspan="8" class="px-4 py-10 text-center text-surface-400">No candidates linked to this requirement.</td></tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
