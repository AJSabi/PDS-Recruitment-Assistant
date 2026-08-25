<script setup lang="ts">
import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardList, Database, FileSearch, Loader2, RefreshCw, Sparkles, UploadCloud, UserPlus, UsersRound } from 'lucide-vue-next'
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
const { data: poolData, status: poolStatus, refresh: refreshPool } = useFetch(() => `/api/jobs/${jobId}/talent-pool`, {
  key: `pds-talent-pool-${jobId}`,
  headers: useRequestHeaders(['cookie']),
})

const batchBusy = ref(false)
const batchProgress = ref({ done: 0, total: 0 })
const poolBusy = ref(false)
const uploadingResumes = ref(false)
const promotingMatchId = ref<string | null>(null)
const resumeInput = ref<HTMLInputElement | null>(null)
const rows = computed<any[]>(() => data.value?.ranking ?? [])
const poolRows = computed<any[]>(() => poolData.value?.ranking ?? [])
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

async function refreshAll() {
  await Promise.all([refreshPool(), refresh()])
}

async function syncTalentPool() {
  poolBusy.value = true
  try {
    const result: any = await $fetch(`/api/jobs/${jobId}/talent-pool/sync`, { method: 'POST' })
    await refreshPool()
    const message = `${result.visibleMatches ?? 0} candidates at or above ${result.threshold ?? 50}% match.`
    if (result.failures?.length) toast.warning('AI Candidate Pool updated with exceptions', `${message} ${result.failures.length} resumes need review.`)
    else toast.success('AI Candidate Pool updated', { message })
  } catch (err: any) {
    toast.error('Could not update AI Candidate Pool', { message: err?.data?.statusMessage ?? err?.message })
  } finally { poolBusy.value = false }
}

async function uploadResumes(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  if (!files.length) return
  uploadingResumes.value = true
  try {
    const formData = new FormData()
    for (const file of files) formData.append('files', file)
    const result: any = await $fetch(`/api/jobs/${jobId}/talent-pool/upload`, { method: 'POST', body: formData })
    await refreshPool()
    const summaryText = `${result.matched ?? 0} added to the 50%+ pool; ${result.belowThreshold ?? 0} below threshold; ${result.failed ?? 0} failed.`
    if (result.failed) toast.warning('Resume intake completed with exceptions', summaryText)
    else toast.success(files.length === 1 ? 'Resume analysed' : 'Resumes analysed', { message: summaryText })
  } catch (err: any) {
    toast.error('Could not process resume upload', { message: err?.data?.statusMessage ?? err?.message })
  } finally {
    uploadingResumes.value = false
    input.value = ''
  }
}

async function promoteMatch(row: any) {
  promotingMatchId.value = row.matchId
  try {
    const result: any = await $fetch(`/api/jobs/${jobId}/talent-pool/${row.matchId}/promote`, { method: 'POST' })
    await refreshAll()
    toast.success(result.alreadyPromoted ? 'Candidate already in recruitment' : 'Candidate moved to recruitment', {
      message: result.alreadyPromoted ? 'Opening the existing recruitment workflow.' : 'AI Skill Analysis and recruiter screening questions were carried forward.',
    })
    await navigateTo(localePath(`/dashboard/recruitment/${result.applicationId}`))
  } catch (err: any) {
    toast.error('Could not move candidate to recruitment', { message: err?.data?.statusMessage ?? err?.message })
  } finally { promotingMatchId.value = null }
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
        <p class="text-xs font-medium uppercase tracking-wide text-surface-400">PDS Recruitment</p>
        <h1 class="mt-1 text-2xl font-bold">{{ job?.title ?? 'Requirement' }}</h1>
        <p class="mt-1 text-sm text-surface-500">The AI Candidate Pool searches the resume database and shows only candidates with a final AI match of 50% or more.</p>
      </div>
      <button class="inline-flex items-center gap-2 rounded-lg border border-surface-300 px-3 py-2 text-sm font-medium" @click="refreshAll"><RefreshCw class="size-4" />Refresh</button>
    </header>

    <section class="mb-8 rounded-xl border border-surface-200 bg-white p-5 dark:border-surface-800 dark:bg-surface-900">
      <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div class="flex items-center gap-2"><Database class="size-4 text-brand-600" /><h2 class="text-base font-semibold">Live AI Candidate Pool</h2></div>
          <p class="mt-1 text-sm text-surface-500">Existing database resumes and resumes added directly to this JD feed the same live ranking. Candidates remain outside the active pipeline until you choose to move them forward.</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <input ref="resumeInput" type="file" multiple accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" class="hidden" @change="uploadResumes" />
          <button :disabled="uploadingResumes || poolBusy" class="inline-flex items-center gap-2 rounded-lg border border-brand-300 px-4 py-2 text-sm font-semibold text-brand-700 disabled:opacity-50" @click="resumeInput?.click()"><Loader2 v-if="uploadingResumes" class="size-4 animate-spin" /><UploadCloud v-else class="size-4" />{{ uploadingResumes ? 'Analysing Resume(s)…' : 'Add Resume(s)' }}</button>
          <button :disabled="poolBusy || uploadingResumes" class="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" @click="syncTalentPool"><Loader2 v-if="poolBusy" class="size-4 animate-spin" /><Sparkles v-else class="size-4" />{{ poolBusy ? 'Updating Candidate Pool…' : 'Refresh Database Matches' }}</button>
        </div>
      </div>

      <div v-if="poolStatus === 'pending'" class="py-8 text-center text-surface-400">Loading AI Candidate Pool…</div>
      <div v-else class="overflow-x-auto rounded-lg border border-surface-200 dark:border-surface-800">
        <table class="min-w-full text-sm">
          <thead class="bg-surface-50 text-left text-xs uppercase tracking-wide text-surface-500 dark:bg-surface-800/60"><tr><th class="px-3 py-3">Rank</th><th class="px-3 py-3">Candidate</th><th class="px-3 py-3">Score</th><th class="px-3 py-3">Priority</th><th class="px-3 py-3">Mandatory Match</th><th class="px-3 py-3">Key Strength</th><th class="px-3 py-3">Main Gap</th><th class="px-3 py-3">Action</th></tr></thead>
          <tbody class="divide-y divide-surface-100 dark:divide-surface-800">
            <tr v-for="row in poolRows" :key="row.matchId" class="hover:bg-surface-50 dark:hover:bg-surface-800/30">
              <td class="px-3 py-3 font-semibold">{{ row.rank }}</td>
              <td class="px-3 py-3 min-w-[220px]"><div class="font-semibold">{{ row.firstName }} {{ row.lastName }}</div><div class="text-xs text-surface-400">{{ row.email }}</div><div class="mt-1 text-[11px] text-surface-400">{{ row.source === 'jd_upload' ? 'Added to this JD' : 'Existing database' }}</div></td>
              <td class="px-3 py-3 text-base font-bold">{{ row.score }}%</td>
              <td class="px-3 py-3 font-semibold">{{ row.priority ?? '—' }}</td>
              <td class="px-3 py-3 min-w-[150px]">{{ row.mandatoryMatch ?? '—' }}</td>
              <td class="px-3 py-3 min-w-[200px]">{{ row.keyStrength ?? '—' }}</td>
              <td class="px-3 py-3 min-w-[200px]">{{ row.mainGap ?? '—' }}</td>
              <td class="px-3 py-3 whitespace-nowrap">
                <NuxtLink v-if="row.promotedApplicationId" :to="localePath(`/dashboard/recruitment/${row.promotedApplicationId}`)" class="inline-flex items-center gap-1.5 rounded-lg border border-success-300 px-3 py-1.5 text-xs font-semibold text-success-700"><CheckCircle2 class="size-3.5" />In Recruitment</NuxtLink>
                <button v-else :disabled="Boolean(promotingMatchId)" class="inline-flex items-center gap-1.5 rounded-lg bg-success-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50" @click="promoteMatch(row)"><Loader2 v-if="promotingMatchId === row.matchId" class="size-3.5 animate-spin" /><UserPlus v-else class="size-3.5" />Move to Recruitment</button>
              </td>
            </tr>
            <tr v-if="!poolRows.length"><td colspan="8" class="px-4 py-8 text-center text-surface-400">No candidates currently meet the 50% AI match threshold.</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section>
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div><h2 class="text-base font-semibold">Active Recruitment Pipeline</h2><p class="mt-1 text-sm text-surface-500">Only candidates selected for recruiter action appear here.</p></div>
        <button :disabled="batchBusy || !batchEligible.length" class="inline-flex items-center gap-2 rounded-lg border border-brand-300 px-3 py-2 text-sm font-semibold text-brand-700 disabled:opacity-40" @click="analyzePendingWithAi"><Loader2 v-if="batchBusy" class="size-4 animate-spin" /><Sparkles v-else class="size-4" />{{ batchBusy ? `Analyzing ${batchProgress.done}/${batchProgress.total}` : `Analyze Pending (${batchEligible.length})` }}</button>
      </div>

      <div v-if="status === 'pending'" class="py-10 text-center text-surface-400">Loading active recruitment…</div>
      <template v-else>
        <div class="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div class="rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900"><div class="flex items-center gap-2 text-surface-500"><UsersRound class="size-4" /><span class="text-xs font-medium uppercase tracking-wide">Active Candidates</span></div><p class="mt-2 text-2xl font-bold">{{ summary.total }}</p></div>
          <div class="rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900"><div class="flex items-center gap-2 text-success-600"><CheckCircle2 class="size-4" /><span class="text-xs font-medium uppercase tracking-wide">Resume Assessed</span></div><p class="mt-2 text-2xl font-bold">{{ summary.assessed }}</p></div>
          <div class="rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900"><div class="flex items-center gap-2 text-surface-500"><ClipboardList class="size-4" /><span class="text-xs font-medium uppercase tracking-wide">Not Yet Assessed</span></div><p class="mt-2 text-2xl font-bold">{{ summary.notYetAssessed }}</p></div>
          <div class="rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900"><div class="flex items-center gap-2 text-warning-600"><AlertTriangle class="size-4" /><span class="text-xs font-medium uppercase tracking-wide">Reassessment Required</span></div><p class="mt-2 text-2xl font-bold">{{ summary.needsReassessment }}</p></div>
        </div>

        <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white dark:border-surface-800 dark:bg-surface-900">
          <table class="min-w-full text-sm">
            <thead class="bg-surface-50 text-left text-xs uppercase tracking-wide text-surface-500 dark:bg-surface-800/60"><tr><th class="px-4 py-3">Rank</th><th class="px-4 py-3">Candidate</th><th class="px-4 py-3">Priority</th><th class="px-4 py-3">Score</th><th class="px-4 py-3">Current Fit</th><th class="px-4 py-3">Recruitment Status</th><th class="px-4 py-3">Next Action</th><th class="px-4 py-3">Main Gap</th></tr></thead>
            <tbody class="divide-y divide-surface-100 dark:divide-surface-800">
              <tr v-for="row in rows" :key="row.applicationId" class="hover:bg-surface-50 dark:hover:bg-surface-800/30">
                <td class="px-4 py-3 font-semibold">{{ row.rank }}</td>
                <td class="px-4 py-3 min-w-[220px]"><NuxtLink :to="localePath(`/dashboard/recruitment/${row.applicationId}`)" class="inline-flex items-center gap-1.5 font-semibold text-brand-600 hover:underline"><ClipboardList class="size-3.5" />{{ row.candidate }}</NuxtLink><div class="text-xs text-surface-400">{{ row.email }}</div><div v-if="row.needsReassessment" class="mt-1 text-xs font-semibold text-warning-600">Requirement changed — reassessment required</div><div v-else-if="row.selectedResume && !row.assessed" class="mt-1 text-xs text-brand-600">Ready for AI resume analysis</div></td>
                <td class="px-4 py-3 font-semibold">{{ row.priority ?? '—' }}</td><td class="px-4 py-3">{{ row.provisionalFitScore != null ? `${row.provisionalFitScore}%` : '—' }}</td><td class="px-4 py-3 min-w-[150px]">{{ label(row.currentFit) }}</td><td class="px-4 py-3 min-w-[170px]">{{ label(row.lastStatus) }}</td><td class="px-4 py-3 min-w-[250px] font-medium text-surface-700 dark:text-surface-200">{{ row.nextAction ?? 'Open recruitment workflow' }}</td><td class="px-4 py-3 min-w-[200px]">{{ row.mainGap ?? '—' }}</td>
              </tr>
              <tr v-if="!rows.length"><td colspan="8" class="px-4 py-10 text-center text-surface-400">No candidates are currently in the active recruitment pipeline.</td></tr>
            </tbody>
          </table>
        </div>
      </template>
    </section>
  </div>
</template>