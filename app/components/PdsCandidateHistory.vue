<script setup lang="ts">
const props = defineProps<{ applicationId: string }>()
const { data, status, refresh } = useFetch(() => `/api/applications/${props.applicationId}/history`, {
  key: computed(() => `pds-history-${props.applicationId}`),
  headers: useRequestHeaders(['cookie']),
})
defineExpose({ refresh })

function label(value?: string | null) {
  return (value ?? '—').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
}
function date(value?: string | Date | null) {
  return value ? new Date(value).toLocaleString() : '—'
}
</script>

<template>
  <section class="rounded-xl border border-surface-200 bg-white p-5 dark:border-surface-800 dark:bg-surface-900">
    <div class="mb-4">
      <h2 class="text-sm font-semibold text-surface-800 dark:text-surface-200">Candidate History</h2>
      <p class="mt-1 text-xs text-surface-500">Chronological evidence for this candidate against this requirement.</p>
    </div>
    <div v-if="status === 'pending'" class="py-6 text-center text-sm text-surface-400">Loading history…</div>
    <template v-else-if="data">
      <div class="mb-5 grid gap-3 sm:grid-cols-4">
        <div class="rounded-lg bg-surface-50 p-3 dark:bg-surface-800/60"><p class="text-[11px] uppercase text-surface-400">Current Fit</p><p class="mt-1 text-sm font-semibold">{{ label(data.profile?.currentFit) }}</p></div>
        <div class="rounded-lg bg-surface-50 p-3 dark:bg-surface-800/60"><p class="text-[11px] uppercase text-surface-400">Last Status</p><p class="mt-1 text-sm font-semibold">{{ label(data.profile?.lastStatus) }}</p></div>
        <div class="rounded-lg bg-surface-50 p-3 dark:bg-surface-800/60"><p class="text-[11px] uppercase text-surface-400">Priority</p><p class="mt-1 text-sm font-semibold">{{ data.profile?.priority ?? '—' }}</p></div>
        <div class="rounded-lg bg-surface-50 p-3 dark:bg-surface-800/60"><p class="text-[11px] uppercase text-surface-400">Requirement Version</p><p class="mt-1 text-sm font-semibold">{{ data.profile?.requirementVersionAssessed ?? 0 }}</p></div>
      </div>

      <div v-if="data.evidence?.length" class="space-y-3">
        <div v-for="item in data.evidence" :key="item.id" class="rounded-lg border border-surface-200 p-3 dark:border-surface-700">
          <div class="flex flex-wrap items-center justify-between gap-2"><span class="text-xs font-semibold text-brand-700 dark:text-brand-300">{{ label(item.type) }}</span><span class="text-xs text-surface-400">{{ date(item.createdAt) }}</span></div>
          <p class="mt-1 text-sm text-surface-700 dark:text-surface-200">{{ item.summary || 'Evidence recorded' }}</p>
        </div>
      </div>
      <div v-else class="rounded-lg border border-dashed border-surface-300 p-4 text-sm text-surface-500 dark:border-surface-700">No recruitment evidence recorded yet.</div>
    </template>
  </section>
</template>
