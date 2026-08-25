<script setup lang="ts">
import { CheckCircle2, FileText, Loader2, ShieldCheck } from 'lucide-vue-next'

const props = defineProps<{
  applicationId: string
  documents: Array<{
    id: string
    type: 'resume' | 'cover_letter' | 'other'
    originalFilename: string
    createdAt: string | Date
  }>
}>()

const emit = defineEmits<{ changed: [] }>()
const toast = useToast()
const isSelecting = ref<string | null>(null)
const aiStatus = ref<string | null>(null)

const { data, status, refresh } = useFetch(() => `/api/applications/${props.applicationId}/recruitment-profile`, {
  key: computed(() => `pds-recruitment-profile-${props.applicationId}`),
  headers: useRequestHeaders(['cookie']),
})

const profile = computed<any>(() => data.value?.profile ?? null)
const resumes = computed(() => props.documents.filter(d => d.type === 'resume'))

const stageLabels: Record<string, string> = {
  candidate_added: 'Candidate Added', resume_received: 'Resume Received', resume_reviewed: 'Resume Reviewed',
  recruiter_screening_pending: 'Recruiter Screening Pending', recruiter_screening_completed: 'Recruiter Screening Completed',
  hod_round_pending: 'HOD Round Pending', hod_round_completed: 'HOD Round Completed', hold_for_comparison: 'Hold for Comparison',
  reassess: 'Reassess', not_proceeding: 'Not Proceeding', offer_stage: 'Offer Stage', offer_accepted: 'Offer Accepted',
  offer_declined: 'Offer Declined', joined: 'Joined', closed: 'Closed',
}

const fitLabels: Record<string, string> = {
  not_yet_assessed: 'Not Yet Assessed', strong_fit: 'Strong Fit', potential_fit: 'Potential Fit',
  borderline_requires_validation: 'Borderline / Requires Validation', significant_gap: 'Significant Gap',
}

async function selectResume(documentId: string) {
  isSelecting.value = documentId
  aiStatus.value = 'Selecting resume…'
  try {
    await $fetch(`/api/applications/${props.applicationId}/resume/select`, {
      method: 'POST',
      body: { documentId },
    })
    await refresh()
    emit('changed')

    aiStatus.value = 'Running AI skill analysis…'
    try {
      const result: any = await $fetch(`/api/applications/${props.applicationId}/resume-assessment/generate`, { method: 'POST' })
      await refresh()
      emit('changed')
      aiStatus.value = `${result?.questions?.length ?? 0} screening questions prepared`
      toast.success('AI candidate analysis completed', {
        message: `${result?.ranking?.priority ?? ''}${result?.ranking?.provisionalFitScore != null ? ` · Score ${result.ranking.provisionalFitScore}` : ''} · ${result?.questions?.length ?? 0} screening questions ready`.trim(),
      })
    } catch (aiErr: any) {
      const message = aiErr?.data?.statusMessage ?? aiErr?.message ?? 'AI analysis could not start.'
      aiStatus.value = message
      toast.warning('Resume selected; AI analysis pending', message)
    }
  } catch (err: any) {
    aiStatus.value = null
    toast.error('Could not select resume', { message: err?.data?.statusMessage ?? err?.message })
  } finally {
    isSelecting.value = null
  }
}
</script>

<template>
  <section class="mb-6 rounded-xl border border-surface-200 bg-white p-5 dark:border-surface-800 dark:bg-surface-900">
    <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div><div class="flex items-center gap-2"><ShieldCheck class="size-4 text-brand-600" /><h2 class="text-sm font-semibold text-surface-800 dark:text-surface-200">PDS Recruitment Workflow</h2></div><p class="mt-1 text-xs text-surface-500">Select the application resume. If the Skill Matrix is approved and AI is configured, analysis and candidate-specific screening questions run automatically.</p></div>
      <Loader2 v-if="status === 'pending'" class="size-4 animate-spin text-surface-400" />
    </div>

    <template v-if="profile">
      <div class="grid gap-3 sm:grid-cols-3">
        <div class="rounded-lg bg-surface-50 p-3 dark:bg-surface-800/60"><p class="text-[11px] uppercase tracking-wide text-surface-400">Recruitment Status</p><p class="mt-1 text-sm font-semibold text-surface-800 dark:text-surface-100">{{ stageLabels[profile.lastStatus] ?? profile.lastStatus }}</p></div>
        <div class="rounded-lg bg-surface-50 p-3 dark:bg-surface-800/60"><p class="text-[11px] uppercase tracking-wide text-surface-400">Current Fit</p><p class="mt-1 text-sm font-semibold text-surface-800 dark:text-surface-100">{{ fitLabels[profile.currentFit] ?? profile.currentFit }}</p></div>
        <div class="rounded-lg bg-surface-50 p-3 dark:bg-surface-800/60"><p class="text-[11px] uppercase tracking-wide text-surface-400">Next Action</p><p class="mt-1 text-sm font-medium text-surface-700 dark:text-surface-200">{{ profile.nextAction || 'No action recorded' }}</p></div>
      </div>

      <div class="mt-5">
        <div class="mb-2"><h3 class="text-sm font-semibold text-surface-800 dark:text-surface-200">Resume for this Application</h3><p class="mt-0.5 text-xs text-surface-500">Choose the resume to assess against this requirement.</p></div>
        <div v-if="resumes.length" class="space-y-2">
          <div v-for="doc in resumes" :key="doc.id" class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-surface-200 px-3 py-3 dark:border-surface-700">
            <div class="flex min-w-0 items-center gap-2.5"><FileText class="size-4 shrink-0 text-surface-400" /><div class="min-w-0"><p class="truncate text-sm font-medium text-surface-800 dark:text-surface-100">{{ doc.originalFilename }}</p><p class="text-xs text-surface-400">{{ new Date(doc.createdAt).toLocaleDateString() }}</p></div></div>
            <span v-if="profile.selectedResumeDocumentId === doc.id" class="inline-flex items-center gap-1 rounded-full bg-success-50 px-2.5 py-1 text-xs font-medium text-success-700 dark:bg-success-950/40 dark:text-success-300"><CheckCircle2 class="size-3.5" /> Selected</span>
            <button v-else type="button" :disabled="Boolean(isSelecting)" class="rounded-lg border border-brand-300 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50 dark:border-brand-700 dark:text-brand-300" @click="selectResume(doc.id)">{{ isSelecting === doc.id ? 'Processing…' : 'Use for this application' }}</button>
          </div>
        </div>
        <p v-else class="rounded-lg border border-dashed border-surface-300 p-4 text-sm text-surface-500 dark:border-surface-700">No resume is available for this candidate. Upload one from Candidate Documents first.</p>
      </div>

      <div class="mt-5 rounded-lg border border-surface-200 bg-surface-50 p-3 dark:border-surface-700 dark:bg-surface-800/40">
        <p class="text-xs font-medium text-surface-700 dark:text-surface-200">AI Processing</p>
        <p v-if="aiStatus" class="mt-1 text-xs text-surface-500">{{ aiStatus }}</p>
        <p v-else-if="!profile.selectedResumeDocumentId" class="mt-1 text-xs text-surface-500">Select a resume to begin the automated assessment path.</p>
        <p v-else-if="profile.lastStatus === 'resume_reviewed'" class="mt-1 text-xs text-surface-500">AI resume/skill assessment completed. Candidate-specific screening questions should now be available below.</p>
        <p v-else class="mt-1 text-xs text-surface-500">If AI did not run, the page will show the prerequisite that still needs attention, such as Skill Matrix approval or AI provider configuration.</p>
      </div>
    </template>
  </section>
</template>
