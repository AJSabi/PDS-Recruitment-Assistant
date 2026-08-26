<script setup lang="ts">
import { BrainCircuit, CheckCircle2, Clock3, Loader2, RefreshCw, ShieldCheck } from 'lucide-vue-next'

const props = defineProps<{ applicationId: string }>()
const toast = useToast()
const generating = ref(false)

const { data, status, refresh } = useFetch(() => `/api/applications/${props.applicationId}/candidate-summary`, {
  key: computed(() => `pds-candidate-summary-${props.applicationId}`),
  headers: useRequestHeaders(['cookie']),
})

const summary = computed<any>(() => data.value ?? null)

const stageLabels: Record<string, string> = {
  candidate_added: 'Candidate Added',
  resume_received: 'Resume Received',
  resume_reviewed: 'Resume Reviewed',
  recruiter_screening_pending: 'Recruiter Screening Pending',
  recruiter_screening_completed: 'Recruiter Screening Completed',
  hiring_manager_round_pending: 'Hiring Manager Round Pending',
  hiring_manager_round_completed: 'Hiring Manager Round Completed',
  hod_round_pending: 'HOD Round Pending',
  hod_round_completed: 'HOD Round Completed',
  hr_round_pending: 'HR Round Pending',
  hr_round_completed: 'HR Round Completed',
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

const roundLabels: Record<string, string> = {
  recruiter_screening: 'Recruiter Screening',
  hiring_manager: 'Hiring Manager Round',
  hod: 'HOD Round',
  hr: 'HR Round',
}

async function generateSummary() {
  generating.value = true
  try {
    await $fetch(`/api/applications/${props.applicationId}/candidate-summary/generate`, { method: 'POST' })
    await refresh()
    toast.success('AI Candidate Summary updated', { message: 'The latest recorded recruitment evidence has been consolidated.' })
  } catch (err: any) {
    toast.error('Could not update AI Candidate Summary', { message: err?.data?.statusMessage ?? err?.message })
  } finally {
    generating.value = false
  }
}
</script>

<template>
  <section class="rounded-2xl border border-brand-100 bg-white shadow-sm dark:border-brand-950 dark:bg-surface-900">
    <div class="flex flex-wrap items-start justify-between gap-3 border-b border-surface-100 px-5 py-4 dark:border-surface-800">
      <div class="flex items-start gap-3">
        <span class="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300"><BrainCircuit class="size-5" /></span>
        <div>
          <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100">AI Candidate Summary</h2>
          <p class="mt-0.5 text-xs text-surface-500">Evidence-based summary for this requirement. It does not replace the confirmed recruitment decision.</p>
        </div>
      </div>
      <button
        type="button"
        :disabled="generating || status === 'pending'"
        class="inline-flex items-center gap-2 rounded-lg border border-brand-200 px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50 dark:border-brand-900 dark:text-brand-300 dark:hover:bg-brand-950/30"
        @click="generateSummary"
      >
        <Loader2 v-if="generating" class="size-3.5 animate-spin" />
        <RefreshCw v-else class="size-3.5" />
        {{ generating ? 'Updating…' : summary?.generated ? 'Update AI Summary' : 'Create AI Summary' }}
      </button>
    </div>

    <div v-if="status === 'pending'" class="px-5 py-8 text-center text-sm text-surface-400">Loading candidate summary…</div>
    <div v-else-if="summary" class="p-5">
      <div v-if="summary.stale" class="mb-4 flex items-start gap-2 rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800 dark:border-warning-900 dark:bg-warning-950/30 dark:text-warning-200">
        <Clock3 class="mt-0.5 size-4 shrink-0" />
        <div><p class="font-semibold">New recruitment evidence is available</p><p class="mt-0.5 text-xs">Update the AI Summary when you want the latest screening, interview or stage decision consolidated. Opening this page does not trigger an AI call.</p></div>
      </div>

      <div class="grid gap-3 sm:grid-cols-3">
        <div class="rounded-xl bg-[#102A43] px-4 py-3 text-white">
          <p class="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/60">Final Status</p>
          <p class="mt-1 text-sm font-semibold">{{ stageLabels[summary.finalStatus] ?? summary.finalStatus }}</p>
        </div>
        <div class="rounded-xl bg-brand-50 px-4 py-3 dark:bg-brand-950/30">
          <p class="text-[10px] font-semibold uppercase tracking-[0.15em] text-brand-600">Current Fit</p>
          <p class="mt-1 text-sm font-semibold text-brand-800 dark:text-brand-200">{{ fitLabels[summary.currentFit] ?? summary.currentFit }}</p>
        </div>
        <div class="rounded-xl bg-accent-50 px-4 py-3 dark:bg-accent-950/30">
          <p class="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-accent-700"><ShieldCheck class="size-3" />Evidence Confidence</p>
          <p class="mt-1 text-sm font-semibold capitalize text-accent-800 dark:text-accent-200">{{ summary.evidenceConfidence ?? 'Not assessed' }}</p>
        </div>
      </div>

      <div class="mt-5 grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
        <div class="rounded-xl border border-surface-200 p-4 dark:border-surface-800">
          <p class="text-xs font-semibold uppercase tracking-wide text-surface-400">Candidate Summary</p>
          <p class="mt-2 text-sm leading-6 text-surface-700 dark:text-surface-200">{{ summary.candidateSummary || 'AI resume assessment has not been completed yet.' }}</p>
        </div>
        <div class="rounded-xl border border-surface-200 p-4 dark:border-surface-800">
          <p class="text-xs font-semibold uppercase tracking-wide text-surface-400">Overall AI Assessment</p>
          <p class="mt-2 text-sm leading-6 text-surface-700 dark:text-surface-200">{{ summary.overallAssessment || 'No consolidated assessment is available yet.' }}</p>
        </div>
      </div>

      <div v-if="summary.interviewBriefs?.length" class="mt-5">
        <h3 class="text-sm font-semibold text-surface-900 dark:text-surface-100">Screening & Interview Brief</h3>
        <div class="mt-3 grid gap-3 md:grid-cols-2">
          <div v-for="item in summary.interviewBriefs" :key="item.round" class="rounded-xl border border-surface-200 bg-surface-50/70 p-4 dark:border-surface-800 dark:bg-surface-800/30">
            <div class="flex items-center gap-2"><CheckCircle2 class="size-4 text-accent-600" /><p class="text-xs font-semibold uppercase tracking-wide text-surface-500">{{ roundLabels[item.round] ?? item.round }}</p></div>
            <p class="mt-2 text-sm leading-6 text-surface-700 dark:text-surface-200">{{ item.brief }}</p>
          </div>
        </div>
      </div>

      <div v-if="summary.finalBrief" class="mt-5 rounded-xl border border-accent-200 bg-accent-50/70 p-4 dark:border-accent-900 dark:bg-accent-950/20">
        <p class="text-xs font-semibold uppercase tracking-wide text-accent-700">Final Recruitment Brief</p>
        <p class="mt-2 text-sm leading-6 text-surface-800 dark:text-surface-100">{{ summary.finalBrief }}</p>
      </div>

      <p v-if="summary.updatedAt" class="mt-4 text-right text-[11px] text-surface-400">Summary evidence updated {{ new Date(summary.updatedAt).toLocaleString() }}</p>
    </div>
  </section>
</template>
