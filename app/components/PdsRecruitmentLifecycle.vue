<script setup lang="ts">
const props = defineProps<{ applicationId: string; profile: any }>()
const emit = defineEmits<{ changed: [] }>()
const toast = useToast()
const busy = ref(false)
const reassessSummary = ref('')
const showReassess = ref(false)

// Resume and recruiter-screening evidence-producing stages are advanced by their workflow actions.
// Hiring Manager, HOD and HR rounds remain manually advanced in the current product version.
const transitionMap: Record<string, string[]> = {
  candidate_added: ['not_proceeding', 'closed'],
  resume_received: ['not_proceeding', 'closed'],
  resume_reviewed: ['hold_for_comparison', 'reassess', 'not_proceeding', 'closed'],
  recruiter_screening_pending: ['hold_for_comparison', 'reassess', 'not_proceeding', 'closed'],
  recruiter_screening_completed: ['hiring_manager_round_pending', 'hold_for_comparison', 'reassess', 'not_proceeding', 'closed'],
  hiring_manager_round_pending: ['hiring_manager_round_completed', 'hold_for_comparison', 'reassess', 'not_proceeding', 'closed'],
  hiring_manager_round_completed: ['hod_round_pending', 'hold_for_comparison', 'reassess', 'not_proceeding', 'closed'],
  hod_round_pending: ['hod_round_completed', 'hold_for_comparison', 'reassess', 'not_proceeding', 'closed'],
  hod_round_completed: ['hr_round_pending', 'hold_for_comparison', 'reassess', 'not_proceeding', 'closed'],
  hr_round_pending: ['hr_round_completed', 'hold_for_comparison', 'reassess', 'not_proceeding', 'closed'],
  hr_round_completed: ['offer_stage', 'hold_for_comparison', 'reassess', 'not_proceeding', 'closed'],
  hold_for_comparison: ['hiring_manager_round_pending', 'hod_round_pending', 'hr_round_pending', 'reassess', 'not_proceeding', 'closed'],
  reassess: ['hold_for_comparison', 'not_proceeding', 'closed'],
  not_proceeding: ['reassess', 'closed'],
  offer_stage: ['offer_accepted', 'offer_declined', 'hold_for_comparison', 'closed'],
  offer_accepted: ['joined', 'offer_declined', 'closed'],
  offer_declined: ['reassess', 'closed'],
  joined: ['closed'],
  closed: [],
}

const labels: Record<string, string> = {
  hiring_manager_round_pending: 'Move to Hiring Manager Round',
  hiring_manager_round_completed: 'Confirm Hiring Manager Completed',
  hod_round_pending: 'Move to HOD Round',
  hod_round_completed: 'Confirm HOD Completed',
  hr_round_pending: 'Move to HR Round',
  hr_round_completed: 'Confirm HR Completed',
  hold_for_comparison: 'Hold for Comparison',
  reassess: 'Reassess',
  not_proceeding: 'Not Proceeding',
  offer_stage: 'Move to Offer Stage',
  offer_accepted: 'Offer Accepted',
  offer_declined: 'Offer Declined',
  joined: 'Joined',
  closed: 'Close Application',
}

const available = computed(() => transitionMap[props.profile?.lastStatus ?? ''] ?? [])

async function confirmStage(stage: string) {
  if (stage === 'reassess') {
    showReassess.value = true
    return
  }

  busy.value = true
  try {
    await $fetch(`/api/applications/${props.applicationId}/stage/confirm`, {
      method: 'POST',
      body: { stage, contactOccurred: false },
    })
    toast.success(`Stage changed to ${labels[stage] ?? stage}`)
    emit('changed')
  } catch (err: any) {
    toast.error('Could not change stage', { message: err?.data?.statusMessage ?? err?.message })
  } finally {
    busy.value = false
  }
}

async function startReassess() {
  if (!reassessSummary.value.trim()) return toast.warning('Reason required', 'Enter why reassessment is required.')
  busy.value = true
  try {
    await $fetch(`/api/applications/${props.applicationId}/reassess`, {
      method: 'POST',
      body: { summary: reassessSummary.value.trim(), nextAction: 'Review new evidence and reassess candidate.' },
    })
    reassessSummary.value = ''
    showReassess.value = false
    toast.success('Candidate moved to Reassess')
    emit('changed')
  } catch (err: any) {
    toast.error('Could not start reassessment', { message: err?.data?.statusMessage ?? err?.message })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="rounded-xl border border-surface-200 bg-white p-5 dark:border-surface-800 dark:bg-surface-900">
    <div class="mb-4">
      <h2 class="text-sm font-semibold text-surface-800 dark:text-surface-200">Recruitment Lifecycle</h2>
      <p class="mt-1 text-xs text-surface-500">Recruiter Screening is completed through the screening workflow. Hiring Manager, HOD and HR stages are moved manually for now while interviews happen externally.</p>
    </div>

    <div v-if="available.length" class="flex flex-wrap gap-2">
      <button
        v-for="stage in available"
        :key="stage"
        :disabled="busy"
        class="rounded-lg border border-surface-300 px-3 py-2 text-xs font-semibold text-surface-700 hover:border-brand-400 hover:text-brand-700 disabled:opacity-50 dark:border-surface-700 dark:text-surface-300"
        @click="confirmStage(stage)"
      >
        {{ labels[stage] ?? stage }}
      </button>
    </div>
    <p v-else class="text-sm text-surface-500">No manual lifecycle action is available at this stage. Complete the next workflow step shown above.</p>

    <div v-if="showReassess" class="mt-4 rounded-lg border border-warning-200 bg-warning-50 p-4 dark:border-warning-800 dark:bg-warning-950/20">
      <label class="block text-xs font-medium text-surface-700 dark:text-surface-200">Reason for reassessment</label>
      <textarea
        v-model="reassessSummary"
        rows="3"
        class="mt-1 w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-900"
        placeholder="New resume, requirement change, contradictory evidence, interview feedback, etc."
      />
      <div class="mt-3 flex justify-end gap-2">
        <button class="rounded-lg border border-surface-300 px-3 py-1.5 text-xs font-medium" @click="showReassess = false">Cancel</button>
        <button :disabled="busy" class="rounded-lg bg-warning-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50" @click="startReassess">Confirm Reassess</button>
      </div>
    </div>
  </section>
</template>
