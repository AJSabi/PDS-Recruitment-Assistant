<script setup lang="ts">
import { Bot, CircleDollarSign, Cpu, Loader2, RefreshCw, TriangleAlert } from '@lucide/vue'

const { data, status, error, refresh: refreshData } = useFetch('/api/dashboard/ai-usage', {
  key: 'pds-management-ai-usage',
  headers: useRequestHeaders(['cookie']),
})
const refresh = () => refreshData()

function formatNumber(value?: number | null) {
  return new Intl.NumberFormat().format(Number(value ?? 0))
}

function formatUsd(value?: number | null) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(Number(value ?? 0))
}
</script>

<template>
  <section class="rounded-2xl border border-surface-200 bg-white shadow-sm dark:border-surface-800 dark:bg-surface-900">
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-surface-100 px-5 py-4 dark:border-surface-800">
      <div>
        <h2 class="font-bold text-[#102A43] dark:text-white">AI Usage & Cost</h2>
        <p class="mt-0.5 text-xs text-surface-400">Persisted analysis runs for the last 30 days. Cost uses configured provider/model pricing, not invoice data.</p>
      </div>
      <button class="inline-flex items-center gap-2 rounded-lg border border-surface-300 px-3 py-2 text-xs font-semibold text-surface-600 dark:border-surface-700 dark:text-surface-300" @click="refresh"><RefreshCw class="size-3.5" />Refresh</button>
    </div>

    <div v-if="status === 'pending'" class="flex items-center justify-center gap-2 px-5 py-12 text-sm text-surface-400"><Loader2 class="size-4 animate-spin" />Loading AI usage…</div>
    <div v-else-if="error" class="flex items-start gap-2 px-5 py-6 text-sm text-danger-600"><TriangleAlert class="mt-0.5 size-4 shrink-0" />AI usage analytics could not be loaded.</div>
    <template v-else>
      <div class="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <div class="rounded-xl bg-[#F7FBFE] p-4 dark:bg-surface-800/40"><Bot class="size-4 text-[#2E86C1]" /><p class="mt-2 text-2xl font-bold text-[#102A43] dark:text-white">{{ formatNumber(data?.summary?.runs) }}</p><p class="text-xs text-surface-500">AI analysis runs</p></div>
        <div class="rounded-xl bg-[#F7FBFE] p-4 dark:bg-surface-800/40"><Cpu class="size-4 text-[#16847F]" /><p class="mt-2 text-2xl font-bold text-[#102A43] dark:text-white">{{ formatNumber(data?.summary?.totalTokens) }}</p><p class="text-xs text-surface-500">Persisted tokens</p></div>
        <div class="rounded-xl bg-[#F7FBFE] p-4 dark:bg-surface-800/40"><CircleDollarSign class="size-4 text-[#A96F12]" /><p class="mt-2 text-2xl font-bold text-[#102A43] dark:text-white">{{ formatUsd(data?.summary?.configuredCostUsd) }}</p><p class="text-xs text-surface-500">Configured-price cost</p></div>
        <div class="rounded-xl bg-[#F7FBFE] p-4 dark:bg-surface-800/40"><TriangleAlert class="size-4 text-[#B45454]" /><p class="mt-2 text-2xl font-bold text-[#102A43] dark:text-white">{{ formatNumber(data?.summary?.unpricedRuns) }}</p><p class="text-xs text-surface-500">Unpriced runs</p></div>
      </div>

      <div class="overflow-x-auto border-t border-surface-100 dark:border-surface-800">
        <table class="w-full min-w-[850px] text-left text-sm">
          <thead class="bg-[#F7FBFE] text-xs uppercase tracking-wide text-surface-500 dark:bg-surface-800/50"><tr><th class="px-5 py-3">Provider / Model</th><th class="px-4 py-3 text-right">Runs</th><th class="px-4 py-3 text-right">Successful</th><th class="px-4 py-3 text-right">Failed</th><th class="px-4 py-3 text-right">Input Tokens</th><th class="px-4 py-3 text-right">Output Tokens</th><th class="px-4 py-3 text-right">Total Tokens</th><th class="px-5 py-3 text-right">Configured Cost</th></tr></thead>
          <tbody class="divide-y divide-surface-100 dark:divide-surface-800">
            <tr v-for="row in data?.models ?? []" :key="`${row.provider}:${row.model}`" class="text-surface-700 dark:text-surface-300">
              <td class="px-5 py-3.5"><p class="font-semibold text-[#102A43] dark:text-white">{{ row.model }}</p><p class="text-xs text-surface-400">{{ row.provider }}<span v-if="row.unpricedRuns"> · {{ row.unpricedRuns }} unpriced</span></p></td>
              <td class="px-4 py-3.5 text-right">{{ formatNumber(row.runs) }}</td><td class="px-4 py-3.5 text-right">{{ formatNumber(row.successfulRuns) }}</td><td class="px-4 py-3.5 text-right">{{ formatNumber(row.failedRuns) }}</td><td class="px-4 py-3.5 text-right">{{ formatNumber(row.promptTokens) }}</td><td class="px-4 py-3.5 text-right">{{ formatNumber(row.completionTokens) }}</td><td class="px-4 py-3.5 text-right">{{ formatNumber(row.totalTokens) }}</td><td class="px-5 py-3.5 text-right font-semibold">{{ formatUsd(row.configuredCostUsd) }}</td>
            </tr>
            <tr v-if="!(data?.models?.length)"><td colspan="8" class="px-5 py-10 text-center text-surface-400">No persisted AI analysis runs were recorded in the last 30 days.</td></tr>
          </tbody>
        </table>
      </div>

      <div class="border-t border-surface-100 px-5 py-4 text-xs leading-5 text-surface-500 dark:border-surface-800">
        {{ data?.limitations?.cost }} {{ data?.limitations?.coverage }}
      </div>
    </template>
  </section>
</template>
