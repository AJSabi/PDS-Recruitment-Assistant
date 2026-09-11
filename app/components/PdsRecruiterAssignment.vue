<script setup lang="ts">
const props = defineProps<{ applicationId: string; assignedRecruiterId?: string | null }>()
const emit = defineEmits<{ changed: [] }>()
const toast = useToast()
const saving = ref(false)
const selected = ref(props.assignedRecruiterId ?? '')

watch(() => props.assignedRecruiterId, value => { selected.value = value ?? '' })

const { data } = useFetch('/api/recruitment/recruiters', {
  key: 'pds-recruiter-directory',
  headers: useRequestHeaders(['cookie']),
})

async function save() {
  saving.value = true
  try {
    await $fetch(`/api/applications/${props.applicationId}/recruiter`, {
      method: 'PUT',
      body: { recruiterUserId: selected.value || null },
    })
    toast.success(selected.value ? 'Recruiter assigned' : 'Recruiter assignment removed')
    emit('changed')
  } catch (err: any) {
    toast.error('Could not update recruiter', { message: err?.data?.statusMessage ?? err?.message })
  } finally { saving.value = false }
}
</script>

<template>
  <div class="flex flex-wrap items-end gap-2 rounded-lg border border-surface-200 bg-surface-50 p-3 dark:border-surface-700 dark:bg-surface-800/40">
    <label class="min-w-[240px] flex-1">
      <span class="mb-1 block text-xs font-medium text-surface-500">Assigned Recruiter</span>
      <select v-model="selected" class="w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-900">
        <option value="">Unassigned</option>
        <option v-for="person in data?.recruiters ?? []" :key="person.id" :value="person.id">{{ person.name }} — {{ person.email }}</option>
      </select>
    </label>
    <button :disabled="saving || selected === (assignedRecruiterId ?? '')" class="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40" @click="save">{{ saving ? 'Saving…' : 'Save Assignment' }}</button>
  </div>
</template>
