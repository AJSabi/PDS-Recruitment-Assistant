<script setup lang="ts">
import { Loader2, RefreshCw } from '@lucide/vue'

const period = ref<30 | 90 | 365>(90)
const periods = [30, 90, 365] as const
const { data, status, error, refresh } = useFetch('/api/dashboard/source-analytics', {
  key: 'source-analytics',
  headers: useRequestHeaders(['cookie']),
  query: computed(() => ({ period: period.value })),
  watch: [period],
})

const categories = computed(() => data.value?.categories ?? [])
const maxCandidates = computed(() => Math.max(1, ...categories.value.map((row: any) => Number(row.candidates ?? 0))))

function volumeWidth(value: number) {
  return `${Math.max(value > 0 ? 4 : 0, Math.round((Number(value ?? 0) / maxCandidates.value) * 100))}%`
}
</script>

<template>
  <section class="overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-sm dark:border-surface-800 dark:bg-surface-900" data-testid="source-analytics">
    <div class="flex flex-col gap-3 border-b border-surface-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-surface-800">
      <div>
        <h2 class="font-bold text-[#102A43] dark:text-white">Source Analytics</h2>
        <p class="mt-0.5 text-xs text-surface-400">Candidate volume and conversion by standardised sourcing channel</p>
      </div>
      <div class="flex items-center gap-1 rounded-xl bg-surface-50 p-1 dark:bg-surface-800">
        <button
          v-for="value in periods"
          :key="value"
          type="button"
          class="rounded-lg px-3 py-1.5 text-xs font-semibold transition"
          :class="period === value ? 'bg-white text-[#176B87] shadow-sm dark:bg-surface-700 dark:text-brand-300' : 'text-surface-400 hover:text-surface-700 dark:hover:text-surface-200'"
          @click="period = value"
        >
          {{ value === 365 ? '1Y' : `${value}D` }}
        </button>
      </div>
    </div>

    <div v-if="status === 'pending'" class="flex items-center justify-center gap-2 px-5 py-12 text-sm text-surface-400">
      <Loader2 class="size-4 animate-spin" />Loading source analytics…
    </div>

    <div v-else-if="error" class="flex items-center justify-between gap-3 px-5 py-6 text-sm text-danger-600">
      <span>Source analytics could not be loaded.</span>
      <button type="button" class="inline-flex items-center gap-1.5 text-xs font-bold" @click="refresh"><RefreshCw class="size-3.5" />Retry</button>
    </div>

    <div v-else class="overflow-x-auto">
      <table class="min-w-[760px] w-full text-left">
        <thead class="bg-[#F9FBFC] text-[10px] font-semibold uppercase tracking-wide text-surface-400 dark:bg-surface-950/30">
          <tr>
            <th class="px-5 py-3">Source</th>
            <th class="px-4 py-3">Candidates</th>
            <th class="px-4 py-3">Interviewed</th>
            <th class="px-4 py-3">Offered</th>
            <th class="px-4 py-3">Joined</th>
            <th class="px-5 py-3">Join Conversion</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-surface-100 dark:divide-surface-800">
          <tr v-for="row in categories" :key="row.source">
            <td class="px-5 py-4">
              <p class="text-sm font-bold text-surface-800 dark:text-surface-100">{{ row.source }}</p>
              <div class="mt-2 h-1.5 w-36 overflow-hidden rounded-full bg-surface-100 dark:bg-surface-800">
                <div class="h-full rounded-full bg-[#2B7C92]" :style="{ width: volumeWidth(row.candidates) }" />
              </div>
            </td>
            <td class="px-4 py-4 text-sm font-bold text-[#102A43] dark:text-white">{{ row.candidates }}</td>
            <td class="px-4 py-4 text-sm font-semibold text-surface-600 dark:text-surface-300">{{ row.interviewed }}</td>
            <td class="px-4 py-4 text-sm font-semibold text-surface-600 dark:text-surface-300">{{ row.offered }}</td>
            <td class="px-4 py-4 text-sm font-semibold text-surface-600 dark:text-surface-300">{{ row.joined }}</td>
            <td class="px-5 py-4">
              <div class="flex items-center gap-2">
                <div class="h-2 w-24 overflow-hidden rounded-full bg-surface-100 dark:bg-surface-800">
                  <div class="h-full rounded-full bg-[#39784A]" :style="{ width: `${Math.min(100, Number(row.joinConversion ?? 0))}%` }" />
                </div>
                <span class="text-xs font-bold text-surface-700 dark:text-surface-200">{{ row.joinConversion }}%</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!categories.length" class="px-5 py-10 text-center text-sm text-surface-400">No sourcing evidence is available for this period.</div>
    </div>

    <div class="border-t border-surface-100 bg-[#F9FBFC] px-5 py-2.5 text-[10px] leading-4 text-surface-400 dark:border-surface-800 dark:bg-surface-950/30">
      Sources are grouped only as Naukri, Social Media, Referral, Database, Consultant and Others. Unmapped source labels are included in Others.
    </div>
  </section>

  <DashboardCycleTimeChart />
</template>
