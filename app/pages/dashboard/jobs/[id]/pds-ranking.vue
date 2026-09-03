<script setup lang="ts">
import { AlertTriangle, ArrowLeft, CheckCircle2, Database, FileSearch, Loader2, RefreshCw, Sparkles, UploadCloud, UserPlus, UsersRound, ShieldCheck } from '@lucide/vue'
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'require-org'] })
const route = useRoute()
const jobId = route.params.id as string
const localePath = useLocalePath()
const toast = useToast()
const { job } = useJob(jobId)

const { data, status, error, refresh } = useFetch(() => `/api/jobs/${jobId}/batch-ranking`, {
  key: `pds-batch-ranking-${jobId}`,
  headers: useRequestHeaders(['cookie']),
})
const { data: poolData, status: poolStatus, error: poolError, refresh: refreshPool } = useFetch(() => `/api/jobs/${jobId}/talent-pool`, {
  key: `pds-talent-pool-${jobId}`,
  headers: useRequestHeaders(['cookie']),
})

const poolBusy = ref(false)
const lastPoolSync = ref<any>(null)
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
const deferredAiCount = computed(() => Number(lastPoolSync.value?.deferredForAiBudget ?? 0))

function label(value?: string | null) {
  return (value ?? '—').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
}
function scoreClass(score?: number | null) {
  if ((score ?? 0) >= 85) return 'bg-[#E9F8F6] text-[#13756F] border-[#B8E2DE]'
  if ((score ?? 0) >= 70) return 'bg-[#EAF4FB] text-[#1F6FA3] border-[#BED9E9]'
  if ((score ?? 0) >= 60) return 'bg-[#FFF7E8] text-[#976511] border-[#E8D7B4]'
  return 'bg-surface-100 text-surface-600 border-surface-200 dark:bg-surface-800 dark:text-surface-300 dark:border-surface-700'
}

async function refreshAll() { await Promise.all([refreshPool(), refresh()]) }
async function syncTalentPool() {
  poolBusy.value = true
  try {
    const result: any = await $fetch(`/api/jobs/${jobId}/talent-pool/sync`, { method: 'POST' })
    lastPoolSync.value = result
    await refreshPool()
    const deferredText = result.deferredForAiBudget ? ` ${result.deferredForAiBudget} plausible resume${result.deferredForAiBudget === 1 ? '' : 's'} deferred to the next refresh to control AI usage.` : ''
    const message = `${result.visibleMatches ?? 0} candidates at or above ${result.threshold ?? 50}% match.${deferredText}`
    if (result.failures?.length) toast.warning('AI Candidate Pool updated with exceptions', `${message} ${result.failures.length} resumes need review.`)
    else toast.success('AI Candidate Pool updated', { message })
  } catch (err: any) { toast.error('Could not update AI Candidate Pool', { message: err?.data?.statusMessage ?? err?.message }) }
  finally { poolBusy.value = false }
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
  } catch (err: any) { toast.error('Could not process resume upload', { message: err?.data?.statusMessage ?? err?.message }) }
  finally { uploadingResumes.value = false; input.value = '' }
}
async function promoteMatch(row: any) {
  promotingMatchId.value = row.matchId
  try {
    const result: any = await $fetch(`/api/jobs/${jobId}/talent-pool/${row.matchId}/promote`, { method: 'POST' })
    await refreshAll()
    toast.success(result.alreadyPromoted ? 'Candidate already in recruitment' : 'Candidate moved to recruitment', {
      message: result.alreadyPromoted ? 'Opening the existing recruitment workflow.' : 'The existing AI match was carried forward. Prepare Recruiter Screening explicitly when ready.',
    })
    await navigateTo(localePath(`/dashboard/recruitment/${result.applicationId}`))
  } catch (err: any) { toast.error('Could not move candidate to recruitment', { message: err?.data?.statusMessage ?? err?.message }) }
  finally { promotingMatchId.value = null }
}
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-6">
    <JobSubNavActions :job-id="jobId" />

    <div class="flex flex-wrap items-center gap-2">
      <NuxtLink :to="localePath(`/dashboard/jobs/${jobId}`)" class="inline-flex items-center gap-1.5 rounded-lg border border-surface-300 px-3 py-1.5 text-sm font-medium text-surface-600 hover:border-brand-400 hover:text-brand-700 dark:border-surface-700 dark:text-surface-300"><ArrowLeft class="size-4" />Pipeline</NuxtLink>
      <NuxtLink :to="localePath(`/dashboard/jobs/${jobId}/ai-analysis`)" class="inline-flex items-center gap-1.5 rounded-lg border border-surface-300 px-3 py-1.5 text-sm font-medium text-surface-600 hover:border-brand-400 hover:text-brand-700 dark:border-surface-700 dark:text-surface-300"><FileSearch class="size-4" />JD & Skill Matrix</NuxtLink>
      <NuxtLink :to="localePath(`/dashboard/jobs/${jobId}/pds-register`)" class="inline-flex items-center gap-1.5 rounded-lg border border-surface-300 px-3 py-1.5 text-sm font-medium text-surface-600 hover:border-brand-400 hover:text-brand-700 dark:border-surface-700 dark:text-surface-300"><UsersRound class="size-4" />Candidate Register</NuxtLink>
    </div>

    <section class="overflow-hidden rounded-3xl bg-[#102A43] px-6 py-6 text-white shadow-sm sm:px-8">
      <div class="flex flex-wrap items-start justify-between gap-5"><div><p class="text-xs font-semibold uppercase tracking-[0.18em] text-[#9FD3F2]">AI Candidate Pool</p><h1 class="mt-2 text-2xl font-bold">{{ job?.title ?? 'Requirement' }}</h1><p class="mt-2 max-w-3xl text-sm leading-6 text-[#D5E6F3]">Only candidates scoring 50% or more against the approved requirement are shown. Add a candidate directly from the requirement header or upload resumes here for AI matching.</p></div><button class="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/15" @click="refreshAll"><RefreshCw class="size-4" />Refresh View</button></div>
    </section>

    <section class="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm dark:border-surface-800 dark:bg-surface-900">
      <div class="flex flex-wrap items-start justify-between gap-4"><div><div class="flex items-center gap-2"><Database class="size-5 text-brand-600" /><h2 class="font-bold text-[#102A43] dark:text-white">Live Candidate Matches</h2></div><p class="mt-1 max-w-2xl text-sm text-surface-500">Click a candidate name to open the Candidate Database record, or move the candidate into Recruitment when you are ready to act.</p></div><div class="flex flex-wrap gap-2"><input ref="resumeInput" type="file" multiple accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" class="hidden" @change="uploadResumes" /><button :disabled="uploadingResumes || poolBusy" class="inline-flex items-center gap-2 rounded-xl border border-brand-300 px-4 py-2.5 text-sm font-semibold text-brand-700 disabled:opacity-50" @click="resumeInput?.click()"><Loader2 v-if="uploadingResumes" class="size-4 animate-spin" /><UploadCloud v-else class="size-4" />{{ uploadingResumes ? 'Analysing…' : 'Add Resume(s)' }}</button><button :disabled="poolBusy || uploadingResumes" class="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" @click="syncTalentPool"><Loader2 v-if="poolBusy" class="size-4 animate-spin" /><Sparkles v-else class="size-4" />{{ poolBusy ? 'Updating…' : 'Refresh Database Matches' }}</button></div></div>

      <div v-if="deferredAiCount" class="mt-4 flex items-start gap-2 rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800"><AlertTriangle class="mt-0.5 size-4 shrink-0" /><div><p class="font-semibold">AI batch limit reached</p><p class="mt-0.5 text-xs">{{ deferredAiCount }} plausible resume{{ deferredAiCount === 1 ? '' : 's' }} remain queued for the next controlled refresh.</p></div></div>
      <div v-if="poolStatus === 'pending'" class="py-10 text-center text-surface-400">Loading AI Candidate Pool…</div>
      <div v-else-if="poolError" class="mt-5 rounded-xl border border-danger-200 bg-danger-50 p-5 text-danger-700"><p class="font-semibold">AI Candidate Pool could not be loaded</p><p class="mt-1 text-sm">{{ (poolError?.data as { statusMessage?: string } | undefined)?.statusMessage ?? poolError?.message ?? 'The server returned an error.' }}</p></div>
      <div v-else-if="!poolRows.length" class="mt-5 rounded-2xl border border-dashed border-surface-300 bg-surface-50 px-5 py-10 text-center"><ShieldCheck class="mx-auto size-7 text-brand-500" /><p class="mt-3 font-semibold text-surface-800">No 50%+ AI matches yet</p></div>
      <div v-else class="mt-5 grid gap-4 lg:grid-cols-2">
        <article v-for="row in poolRows" :key="row.matchId" class="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-surface-800 dark:bg-surface-900">
          <div class="flex items-start justify-between gap-4"><div class="min-w-0"><div class="flex flex-wrap items-center gap-2"><span class="flex size-8 items-center justify-center rounded-full bg-[#102A43] text-xs font-bold text-white">#{{ row.rank }}</span><NuxtLink :to="localePath(`/dashboard/candidates/${row.candidateId}`)" class="truncate text-lg font-bold text-[#102A43] underline-offset-2 hover:underline dark:text-white">{{ row.firstName }} {{ row.lastName }}</NuxtLink></div><p class="mt-1 truncate text-sm text-surface-500">{{ row.email }}</p><p class="mt-1 text-[11px] font-medium uppercase tracking-wide text-surface-400">{{ row.source === 'jd_upload' ? 'Added to this requirement' : 'Existing candidate database' }}</p></div><div class="shrink-0 rounded-2xl border px-4 py-3 text-center" :class="scoreClass(row.score)"><p class="text-[10px] font-bold uppercase tracking-wide">AI Match</p><p class="mt-1 text-2xl font-black">{{ row.score }}%</p><p class="text-xs font-bold">{{ row.priority ?? '—' }}</p></div></div>
          <div class="mt-4 grid gap-3 sm:grid-cols-3"><div class="rounded-xl bg-[#F7FBFE] p-3"><p class="text-[10px] font-bold uppercase tracking-wide text-[#1F6FA3]">Mandatory Match</p><p class="mt-1 text-sm font-semibold">{{ row.mandatoryMatch ?? '—' }}</p></div><div class="rounded-xl bg-[#F1FAF8] p-3"><p class="text-[10px] font-bold uppercase tracking-wide text-[#16847F]">Key Strength</p><p class="mt-1 text-sm font-semibold">{{ row.keyStrength ?? '—' }}</p></div><div class="rounded-xl bg-[#FFF9EC] p-3"><p class="text-[10px] font-bold uppercase tracking-wide text-[#976511]">Main Gap</p><p class="mt-1 text-sm font-semibold">{{ row.mainGap ?? '—' }}</p></div></div>
          <div class="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-surface-100 pt-4"><NuxtLink :to="localePath(`/dashboard/candidates/${row.candidateId}`)" class="text-xs font-semibold text-[#1F6FA3] hover:underline">View Candidate</NuxtLink><NuxtLink v-if="row.promotedApplicationId" :to="localePath(`/dashboard/recruitment/${row.promotedApplicationId}`)" class="inline-flex items-center gap-1.5 rounded-xl border border-success-300 px-3 py-2 text-xs font-semibold text-success-700 no-underline"><CheckCircle2 class="size-3.5" />Open Recruitment</NuxtLink><button v-else :disabled="Boolean(promotingMatchId)" class="inline-flex items-center gap-1.5 rounded-xl bg-[#16847F] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50" @click="promoteMatch(row)"><Loader2 v-if="promotingMatchId === row.matchId" class="size-3.5 animate-spin" /><UserPlus v-else class="size-3.5" />Move to Recruitment</button></div>
        </article>
      </div>
    </section>

    <section class="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm dark:border-surface-800 dark:bg-surface-900">
      <div><h2 class="font-bold text-[#102A43] dark:text-white">Active Recruitment Pipeline</h2><p class="mt-1 text-sm text-surface-500">Candidates already selected for recruiter action. AI assessment is performed through explicit candidate intake or governed reassessment, not bulk-scored from this view.</p></div>
      <div v-if="status === 'pending'" class="py-10 text-center text-surface-400">Loading active recruitment…</div>
      <div v-else-if="error" class="mt-4 rounded-xl border border-danger-200 bg-danger-50 p-5 text-danger-700"><p class="font-semibold">Active recruitment could not be loaded</p></div>
      <template v-else><div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div class="rounded-xl bg-[#F7FBFE] p-4"><p class="text-xs font-semibold text-surface-500">Active Candidates</p><p class="mt-1 text-2xl font-bold text-[#102A43]">{{ summary.total }}</p></div><div class="rounded-xl bg-[#F1FAF8] p-4"><p class="text-xs font-semibold text-surface-500">Resume Assessed</p><p class="mt-1 text-2xl font-bold text-[#16847F]">{{ summary.assessed }}</p></div><div class="rounded-xl bg-surface-50 p-4"><p class="text-xs font-semibold text-surface-500">Not Yet Assessed</p><p class="mt-1 text-2xl font-bold text-surface-800">{{ summary.notYetAssessed }}</p></div><div class="rounded-xl bg-[#FFF9EC] p-4"><p class="text-xs font-semibold text-surface-500">Reassessment Required</p><p class="mt-1 text-2xl font-bold text-[#976511]">{{ summary.needsReassessment }}</p></div></div><div class="mt-4 space-y-3"><NuxtLink v-for="row in rows" :key="row.applicationId" :to="localePath(`/dashboard/recruitment/${row.applicationId}`)" class="grid gap-3 rounded-xl border border-surface-200 p-4 no-underline hover:border-brand-300 hover:bg-[#F7FBFE] md:grid-cols-[1.2fr_.7fr_.8fr_1.3fr]"><div><p class="font-semibold">{{ row.candidate }}</p><p class="text-xs text-surface-400">{{ row.email }}</p></div><div><p class="text-[10px] uppercase tracking-wide text-surface-400">Priority / Score</p><p class="mt-1 text-sm font-semibold">{{ row.priority ?? '—' }} · {{ row.provisionalFitScore != null ? `${row.provisionalFitScore}%` : '—' }}</p></div><div><p class="text-[10px] uppercase tracking-wide text-surface-400">Stage</p><p class="mt-1 text-sm font-semibold">{{ label(row.lastStatus) }}</p></div><div><p class="text-[10px] uppercase tracking-wide text-surface-400">Next Action</p><p class="mt-1 text-sm font-medium text-[#1F6FA3]">{{ row.nextAction ?? 'Open recruitment workflow' }}</p></div></NuxtLink><div v-if="!rows.length" class="rounded-xl border border-dashed border-surface-300 px-4 py-8 text-center text-sm text-surface-400">No candidates are currently in active recruitment.</div></div></template>
    </section>
  </div>
</template>
