<script setup lang="ts">
const props = defineProps<{ applicationId: string; profile: any }>()
const emit = defineEmits<{ changed: [] }>()
const toast = useToast()
const busy = ref(false)
const reassessSummary = ref('')
const showReassess = ref(false)
const stageNote = ref('')

// Normal recruitment progression is strictly sequential. Resume assessment and recruiter
// screening advance through their own workflow actions; external interview rounds are
// confirmed manually here.
const primaryNextStage: Record<string, string | null> = {
  candidate_added: null,
  resume_received: null,
  resume_reviewed: null,
  recruiter_screening_pending: null,
  recruiter_screening_completed: 'hiring_manager_round_pending',
  hiring_manager_round_pending: 'hiring_manager_round_completed',
  hiring_manager_round_completed: 'hod_round_pending',
  hod_round_pending: 'hod_round_completed',
  hod_round_completed: 'hr_round_pending',
  hr_round_pending: 'hr_round_completed',
  hr_round_completed: 'offer_stage',
  hold_for_comparison: null,
  reassess: null,
  not_proceeding: null,
  offer_stage: null,
  offer_accepted: 'joined',
  offer_declined: null,
  joined: 'closed',
  closed: null,
}

const labels: Record<string, string> = {
  hiring_manager_round_pending: 'Move to Hiring Manager Round',
  hiring_manager_round_completed: 'Confirm Hiring Manager Round Completed',
  hod_round_pending: 'Move to HOD Round',
  hod_round_completed: 'Confirm HOD Round Completed',
  hr_round_pending: 'Move to HR Round',
  hr_round_completed: 'Confirm HR Round Completed',
  hold_for_comparison: 'Hold for Comparison',
  reassess: 'Reassess',
  not_proceeding: 'Not Proceeding',
  offer_stage: 'Move to Offer Stage',
  offer_accepted: 'Offer Accepted',
  offer_declined: 'Offer Declined',
  joined: 'Confirm Joined',
  closed: 'Close Application',
}

const currentStatus = computed(() => props.profile?.lastStatus ?? '')
const primaryStage = computed(() => primaryNextStage[currentStatus.value] ?? null)
const canHold = computed(() => [
  'resume_reviewed',
  'recruiter_screening_pending',
  'recruiter_screening_completed',
  'hiring_manager_round_pending',
  'hiring_manager_round_completed',
  'hod_round_pending',
  'hod_round_completed',
  'hr_round_pending',
  'hr_round_completed',
  'offer_stage',
].includes(currentStatus.value))
const canReassess = computed(() => !['candidate_added', 'closed', 'joined'].includes(currentStatus.value))
const canStop = computed(() => !['closed', 'joined'].includes(currentStatus.value))

const stageGuidance = computed(() => {
  switch (currentStatus.value) {
    case 'recruiter_screening_completed': return 'Recruiter Screening is complete. Move the candidate to the Hiring Manager Round when ready.'
    case 'hiring_manager_round_pending': return 'After the external Hiring Manager discussion is completed, confirm completion here.'
    case 'hiring_manager_round_completed': return 'Hiring Manager Round is complete. Move the candidate to the HOD Round.'
    case 'hod_round_pending': return 'After the external HOD discussion is completed, confirm completion here.'
    case 'hod_round_completed': return 'HOD Round is complete. Move the candidate to the HR Round.'
    case 'hr_round_pending': return 'After the external HR discussion is completed, confirm completion here.'
    case 'hr_round_completed': return 'HR Round is complete. Move the candidate to Offer when approved.'
    case 'hold_for_comparison': return 'Candidate is on hold. Resume the appropriate workflow stage after the comparison decision, or choose Reassess / Not Proceeding.'
    case 'reassess': return 'Complete the reassessment workflow above before advancing the candidate.'
    case 'offer_stage': return 'Record the offer outcome when known.'
    case 'offer_accepted': return 'Confirm Joined after the candidate has actually joined.'
    default: return 'Complete the current workflow action shown above before advancing the candidate.'
  }
})

async function confirmStage(stage: string, requireNote = false) {
  if (stage === 'reassess') {
    showReassess.value = true
    return
  }
  if (requireNote && !stageNote.value.trim()) {
    return toast.warning('Comment required', 'Add a short reason before recording this decision.')
  }

  busy.value = true
  try {
    await $fetch(`/api/applications/${props.applicationId}/stage/confirm`, {
      method: 'POST',
      body: {
        stage,
        note: stageNote.value.trim() || null,
        contactOccurred: false,
      },
    })
    stageNote.value = ''
    toast.success(labels[stage] ?? 'Recruitment stage updated')
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
      <h2 class="text-sm font-semibold text-surface-800 dark:text-surface-200">Stage Progression</h2>
      <p class="mt-1 text-xs text-surface-500">Recruiter Screening is completed in the screening section. Hiring Manager, HOD and HR interviews happen externally; only their completion and the next stage are recorded here.</p>
    </div>

    <div class="rounded-lg bg-surface-50 p-4 dark:bg-surface-800/50">
      <p class="text-[11px] font-medium uppercase tracking-wide text-surface-400">Current Action</p>
      <p class="mt-1 text-sm text-surface-700 dark:text-surface-200">{{ stageGuidance }}</p>

      <div v-if="primaryStage" class="mt-4">
        <label v-if="currentStatus.endsWith('_pending')" class="mb-3 block">
          <span class="text-xs font-medium text-surface-600 dark:text-surface-300">Round comment <span class="font-normal text-surface-400">(optional)</span></span>
          <textarea v-model="stageNote" rows="2" class="mt-1 w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-900" placeholder="Key outcome or brief interview note" />
        </label>
        <button :disabled="busy" class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" @click="confirmStage(primaryStage)">
          {{ labels[primaryStage] ?? primaryStage }}
        </button>
      </div>

      <div v-if="currentStatus === 'offer_stage'" class="mt-4 flex flex-wrap gap-2">
        <button :disabled="busy" class="rounded-lg bg-success-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" @click="confirmStage('offer_accepted')">Offer Accepted</button>
        <button :disabled="busy" class="rounded-lg border border-danger-300 px-4 py-2 text-sm font-semibold text-danger-700 disabled:opacity-50" @click="confirmStage('offer_declined', true)">Offer Declined</button>
      </div>
    </div>

    <details v-if="canHold || canReassess || canStop" class="mt-4 rounded-lg border border-surface-200 p-4 dark:border-surface-800">
      <summary class="cursor-pointer text-sm font-medium text-surface-700 dark:text-surface-200">Other decisions</summary>
      <div class="mt-3">
        <label class="block">
          <span class="text-xs font-medium text-surface-600 dark:text-surface-300">Decision comment</span>
          <textarea v-model="stageNote" rows="2" class="mt-1 w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-900" placeholder="Required for Hold or Not Proceeding" />
        </label>
        <div class="mt-3 flex flex-wrap gap-2">
          <button v-if="canHold" :disabled="busy" class="rounded-lg border border-surface-300 px-3 py-2 text-xs font-semibold text-surface-700 disabled:opacity-50" @click="confirmStage('hold_for_comparison', true)">Hold for Comparison</button>
          <button v-if="canReassess" :disabled="busy" class="rounded-lg border border-warning-300 px-3 py-2 text-xs font-semibold text-warning-700 disabled:opacity-50" @click="confirmStage('reassess')">Reassess</button>
          <button v-if="canStop" :disabled="busy" class="rounded-lg border border-danger-300 px-3 py-2 text-xs font-semibold text-danger-700 disabled:opacity-50" @click="confirmStage('not_proceeding', true)">Not Proceeding</button>
        </div>
      </div>
    </details>

    <div v-if="showReassess" class="mt-4 rounded-lg border border-warning-200 bg-warning-50 p-4 dark:border-warning-800 dark:bg-warning-950/20">
      <label class="block text-xs font-medium text-surface-700 dark:text-surface-200">Reason for reassessment</label>
      <textarea v-model="reassessSummary" rows="3" class="mt-1 w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-900" placeholder="New resume, requirement change, contradictory evidence, interview feedback, etc." />
      <div class="mt-3 flex justify-end gap-2">
        <button class="rounded-lg border border-surface-300 px-3 py-1.5 text-xs font-medium" @click="showReassess = false">Cancel</button>
        <button :disabled="busy" class="rounded-lg bg-warning-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50" @click="startReassess">Confirm Reassess</button>
      </div>
    </div>
  </section>
</template>
