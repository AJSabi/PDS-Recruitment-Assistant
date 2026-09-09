<script setup lang="ts">
import { Clock3, Loader2, RefreshCw } from '@lucide/vue'

type CycleMetric = 'allocation_to_offer' | 'allocation_to_closure'

const metric = ref<CycleMetric>('allocation_to_offer')
const period = ref<30 | 90 | 365>(90)

const query = computed(() => ({ metric: metric.value, period: period.value }))
const { data, status, error, refresh } = useFetch('/api/dashboard/cycle-time', {
  key: 'dashboard-cycle-time',
  headers: useRequestHeaders(['cookie']),
  query,
  watch: [metric, period],
})

const buckets = computed(() => data.value?.buckets ?? {
  days0to15: 0,
  days16to30: 0,
  days31to45: 0,
  days46to60: 0,
  days61plus: 0,
})

const bucketRows = computed(() => [
  { label: '0–15 days', value: buckets.value.days0to15 },
  { label: '16–30 days', value: buckets.value.days16to30 },
  { label: '31–45 days', value: buckets.value.days31to45 },
  { label: '46–60 days', value: buckets.value.days46to60 },
  { label: '61+ days', value: buckets.value.days61plus },
])

const maxBucket = computed(() => Math.max(1, ...bucketRows.value.map(row => Number(row.value ?? 0))))

function bucketWidth(value: number) {
  return `${Math.max(value > 0 ? 6 : 0, Math.round((Number(value ?? 0) / maxBucket.value) * 100))}%`
}
</script>

<template>
  <section class="overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-sm dark:border-surface-800 dark:bg-surface-900" data-testid="cycle-time-chart">
    <div class="flex flex-col gap-3 border-b border-surface-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between dark:border-surface-800">
      <div class="flex items-center gap-2">
        <span class="flex size-8 items-center justify-center rounded-lg bg-[#F1F0FB] text-[#5F5AA8]"><Clock3 class="size-4" /></span>
        <div>
          <h2 class="font-bold text-[#102A43] dark:text-white">Cycle Time</h2>
          <p class="text-xs text-surface-400">Completed-cycle TAT measured from requirement allocation</p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <select
          v-model="metric"
          class="h-9 rounded-lg border border-surface-200 bg-white px-3 text-xs font-semibold text-surface-700 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-200"
          aria-label="Cycle time metric"
        >
          <option value="allocation_to_offer">Allocation → Offer</option>
          <option value="allocation_to_closure">Allocation → Closure</option>
        </select>

        <div class="inline-flex rounded-lg border border-surface-200 p-0.5 dark:border-surface-700">
          <button
            v-for="value in ([30, 90, 365] as const)"
            :key="value"
            type="button"
            class="rounded-md px-3 py-1.5 text-xs font-semibold transition"
            :class="period === value ? 'bg-[#176B87] text-white' : 'text-surface-500 hover:bg-surface-50 dark:hover:bg-surface-800'"
            @click="period = value"
          >
            {{ value === 365 ? '1Y' : `${value}D` }}
          </button>
        </div>

        <button type="button" class="inline-flex size-9 items-center justify-center rounded-lg border border-surface-200 text-surface-500 hover:bg-surface-50 dark:border-surface-700 dark:hover:bg-surface-800" aria-label="Refresh cycle time" @click="refresh()">
          <RefreshCw class="size-4" />
        </button>
      </div>
    </div>

    <div v-if="status === 'pending'" class="flex items-center justify-center gap-2 px-5 py-12 text-sm text-surface-400">
      <Loader2 class="size-4 animate-spin" /> Loading cycle time…
    </div>

    <div v-else-if="error" class="px-5 py-8 text-center text-sm text-danger-600">
      Cycle time could not be loaded.
    </div>

    <div v-else class="grid gap-0 xl:grid-cols-[.7fr_1.3fr]">
      <div class="grid grid-cols-3 gap-3 border-b border-surface-100 p-5 xl:border-b-0 xl:border-r dark:border-surface-800">
        <div class="rounded-xl bg-[#F9FBFC] p-4 dark:bg-surface-950/30">
          <p class="text-[11px] uppercase tracking-wide text-surface-400">Average</p>
          <p class="mt-2 text-2xl font-bold text-[#102A43] dark:text-white">{{ data?.averageDays == null ? '—' : `${data.averageDays}d` }}</p>
        </div>
        <div class="rounded-xl bg-[#F9FBFC] p-4 dark:bg-surface-950/30">
          <p class="text-[11px] uppercase tracking-wide text-surface-400">Median</p>
          <p class="mt-2 text-2xl font-bold text-[#102A43] dark:text-white">{{ data?.medianDays == null ? '—' : `${data.medianDays}d` }}</p>
        </div>
        <div class="rounded-xl bg-[#F9FBFC] p-4 dark:bg-surface-950/30">
          <p class="text-[11px] uppercase tracking-wide text-surface-400">Samples</p>
          <p class="mt-2 text-2xl font-bold text-[#102A43] dark:text-white">{{ data?.samples ?? 0 }}</p>
        </div>
      </div>

      <div class="p-5">
        <div class="space-y-3">
          <div v-for="row in bucketRows" :key="row.label">
            <div class="mb-1 flex items-center justify-between text-xs">
              <span class="font-medium text-surface-600 dark:text-surface-300">{{ row.label }}</span>
              <span class="font-bold text-[#102A43] dark:text-white">{{ row.value }}</span>
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-surface-100 dark:bg-surface-800">
              <div class="h-full rounded-full bg-[#6FA8B8] transition-all" :style="{ width: bucketWidth(row.value) }" />
            </div>
          </div>
        </div>
        <p class="mt-4 text-[10px] leading-4 text-surface-400">{{ data?.note }}</p>
      </div>
    </div>
  </section>
</template>
