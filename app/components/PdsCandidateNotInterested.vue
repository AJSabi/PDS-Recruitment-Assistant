<script setup lang="ts">
const props = defineProps<{ applicationId: string; status?: string | null }>()
const emit = defineEmits<{ changed: [] }>()
const toast = useToast()

const reason = ref<'role' | 'compensation' | 'location' | 'timing' | 'other'>('role')
const note = ref('')
const open = ref(false)
const busy = ref(false)

const visible = computed(() => ['resume_reviewed', 'recruiter_screening_pending'].includes(props.status ?? ''))

async function markNotInterested() {
  if (reason.value === 'other' && !note.value.trim()) {
    return toast.warning('Reason required', 'Add a short note when Other is selected.')
  }

  busy.value = true
  try {
    const result: any = await $fetch(`/api/applications/${props.applicationId}/screening/not-interested`, {
      method: 'POST',
      body: { reason: reason.value, note: note.value.trim() || null },
    })
    toast.success('Candidate marked Not Interested', { message: result.message })
    open.value = false
    note.value = ''
    emit('changed')
  } catch (err: any) {
    toast.error('Could not record candidate decision', { message: err?.data?.statusMessage ?? err?.message })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section v-if="visible" class="rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p class="text-sm font-semibold text-surface-800 dark:text-surface-200">Candidate decision during Recruiter Screening</p>
        <p class="mt-1 text-xs text-surface-500">If the candidate does not wish to continue, record Candidate Not Interested instead of treating it as a recruiter rejection.</p>
      </div>
      <button type="button" class="rounded-lg border border-surface-300 px-3 py-2 text-sm font-semibold text-surface-700 hover:border-danger-300 hover:text-danger-700 dark:border-surface-700 dark:text-surface-200" @click="open = !open">
        Candidate Not Interested
      </button>
    </div>

    <div v-if="open" class="mt-4 space-y-3 rounded-lg bg-surface-50 p-4 dark:bg-surface-800/50">
      <label class="block">
        <span class="text-xs font-medium text-surface-600 dark:text-surface-300">Reason</span>
        <select v-model="reason" class="mt-1 w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-900">
          <option value="role">Not interested in the role</option>
          <option value="compensation">Compensation not suitable</option>
          <option value="location">Location not suitable</option>
          <option value="timing">Timing / availability not suitable</option>
          <option value="other">Other</option>
        </select>
      </label>

      <label class="block">
        <span class="text-xs font-medium text-surface-600 dark:text-surface-300">Note <span class="font-normal text-surface-400">({{ reason === 'other' ? 'required' : 'optional' }})</span></span>
        <textarea v-model="note" rows="2" class="mt-1 w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-900" placeholder="Brief candidate feedback or context" />
      </label>

      <p class="text-xs text-surface-500">This stops the current application only. The candidate remains in the central Candidate Database and may be reconsidered later through Reassess.</p>

      <div class="flex justify-end gap-2">
        <button type="button" class="rounded-lg border border-surface-300 px-3 py-2 text-xs font-semibold" @click="open = false">Cancel</button>
        <button type="button" :disabled="busy" class="rounded-lg bg-danger-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" @click="markNotInterested">Confirm Candidate Not Interested</button>
      </div>
    </div>
  </section>
</template>
