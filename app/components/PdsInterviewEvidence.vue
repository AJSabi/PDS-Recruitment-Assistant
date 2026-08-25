<script setup lang="ts">
const props = defineProps<{ applicationId: string; status?: string | null }>()
const emit = defineEmits<{ changed: [] }>()
const toast = useToast()
const saving = ref(false)

const enabled = computed(() => [
  'hiring_manager_round_pending',
  'hiring_manager_round_completed',
  'hod_round_pending',
  'hod_round_completed',
  'hr_round_pending',
  'hr_round_completed',
  'reassess',
].includes(props.status ?? ''))

function defaultInterviewType(status?: string | null) {
  if (status?.startsWith('hiring_manager_')) return 'hiring_manager'
  if (status?.startsWith('hr_')) return 'hr'
  if (status?.startsWith('hod_')) return 'hod'
  return 'interview'
}

const form = reactive({
  interviewType: defaultInterviewType(props.status),
  summary: '',
  fit: '',
  strengths: '',
  concerns: '',
  validationFocus: '',
  recommendation: '',
  updateCurrentFit: false,
})

watch(() => props.status, (status) => {
  if (!form.summary.trim()) form.interviewType = defaultInterviewType(status)
})

function lines(value: string) { return value.split('\n').map(v => v.trim()).filter(Boolean) }

async function saveEvidence() {
  if (!form.summary.trim()) return toast.warning('Summary required', 'Enter the interview assessment summary.')
  if (form.updateCurrentFit && !form.fit) return toast.warning('Fit required', 'Select the confirmed fit before updating Current Fit.')
  saving.value = true
  try {
    await $fetch(`/api/applications/${props.applicationId}/interview-evidence`, {
      method: 'POST',
      body: {
        interviewType: form.interviewType,
        summary: form.summary.trim(),
        fit: form.fit || undefined,
        strengths: lines(form.strengths),
        concerns: lines(form.concerns),
        validationFocus: lines(form.validationFocus),
        recommendation: form.recommendation || undefined,
        updateCurrentFit: form.updateCurrentFit,
      },
    })
    Object.assign(form, {
      interviewType: defaultInterviewType(props.status),
      summary: '',
      fit: '',
      strengths: '',
      concerns: '',
      validationFocus: '',
      recommendation: '',
      updateCurrentFit: false,
    })
    toast.success('Interview evidence saved')
    emit('changed')
  } catch (err: any) {
    toast.error('Could not save interview evidence', { message: err?.data?.statusMessage ?? err?.message })
  } finally { saving.value = false }
}
</script>

<template>
  <section class="rounded-xl border border-surface-200 bg-white p-5 dark:border-surface-800 dark:bg-surface-900">
    <div class="mb-4">
      <h2 class="text-sm font-semibold text-surface-800 dark:text-surface-200">Interview Evidence</h2>
      <p class="mt-1 text-xs text-surface-500">Optional evidence may be recorded for Hiring Manager, HOD or HR rounds. Stage movement remains a separate manual recruiter action.</p>
    </div>

    <div v-if="!enabled" class="rounded-lg border border-dashed border-surface-300 p-4 text-sm text-surface-500 dark:border-surface-700">Available when the candidate reaches Hiring Manager, HOD, HR or Reassess.</div>

    <div v-else class="space-y-4">
      <div class="grid gap-3 sm:grid-cols-3">
        <label><span class="mb-1 block text-xs font-medium text-surface-600">Evidence Type</span><select v-model="form.interviewType" class="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800"><option value="hiring_manager">Hiring Manager Round</option><option value="hod">HOD Round</option><option value="hr">HR Round</option><option value="interview">Other Interview</option></select></label>
        <label><span class="mb-1 block text-xs font-medium text-surface-600">Confirmed Fit</span><select v-model="form.fit" class="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800"><option value="">Not changing fit</option><option value="strong_fit">Strong Fit</option><option value="potential_fit">Potential Fit</option><option value="borderline_requires_validation">Borderline / Requires Validation</option><option value="significant_gap">Significant Gap</option></select></label>
        <label><span class="mb-1 block text-xs font-medium text-surface-600">Recommendation</span><select v-model="form.recommendation" class="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800"><option value="">None</option><option value="proceed">Proceed</option><option value="hold">Hold for Comparison</option><option value="reassess">Reassess</option><option value="not_proceeding">Recruiter Decision Required</option><option value="offer">Consider Offer Stage</option></select></label>
      </div>

      <label class="block"><span class="mb-1 block text-xs font-medium text-surface-600">Assessment Summary</span><textarea v-model="form.summary" rows="4" class="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800" placeholder="Key evidence and overall assessment" /></label>

      <div class="grid gap-3 sm:grid-cols-3">
        <label><span class="mb-1 block text-xs font-medium text-surface-600">Strengths</span><textarea v-model="form.strengths" rows="4" class="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800" placeholder="One per line" /></label>
        <label><span class="mb-1 block text-xs font-medium text-surface-600">Concerns</span><textarea v-model="form.concerns" rows="4" class="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800" placeholder="One per line" /></label>
        <label><span class="mb-1 block text-xs font-medium text-surface-600">Validation Focus</span><textarea v-model="form.validationFocus" rows="4" class="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800" placeholder="One per line" /></label>
      </div>

      <label class="flex items-center gap-2 text-sm text-surface-700 dark:text-surface-200"><input v-model="form.updateCurrentFit" type="checkbox" class="rounded" />Use this evidence to update and lock Current Fit</label>

      <div class="flex justify-end"><button :disabled="saving" class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" @click="saveEvidence">{{ saving ? 'Saving…' : 'Save Interview Evidence' }}</button></div>
    </div>
  </section>
</template>
