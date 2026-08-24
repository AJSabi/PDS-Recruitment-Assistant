<script setup lang="ts">
import { ArrowLeft, ClipboardList, FileSearch, RefreshCw } from 'lucide-vue-next'
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'require-org'] })
const route = useRoute()
const jobId = route.params.id as string
const localePath = useLocalePath()
const { job } = useJob(jobId)
const { data, status, refresh } = useFetch(() => `/api/jobs/${jobId}/batch-ranking`, {
  key: `pds-batch-ranking-${jobId}`,
  headers: useRequestHeaders(['cookie']),
})
function label(value?: string | null) {
  return (value ?? '—').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
}
</script>

<template>
  <div class="mx-auto max-w-7xl">
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <NuxtLink :to="localePath(`/dashboard/jobs/${jobId}`)" class="inline-flex items-center gap-1.5 rounded-lg border border-surface-300 px-3 py-1.5 text-sm font-medium text-surface-600 hover:border-brand-400 hover:text-brand-700 dark:border-surface-700 dark:text-surface-300"><ArrowLeft class="size-4" />Pipeline</NuxtLink>
      <NuxtLink :to="localePath(`/dashboard/jobs/${jobId}/ai-analysis`)" class="inline-flex items-center gap-1.5 rounded-lg border border-surface-300 px-3 py-1.5 text-sm font-medium text-surface-600 hover:border-brand-400 hover:text-brand-700 dark:border-surface-700 dark:text-surface-300"><FileSearch class="size-4" />JD & Skill Matrix</NuxtLink>
    </div>

    <header class="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-xs font-medium uppercase tracking-wide text-surface-400">PDS Recruitment Work Queue</p>
        <h1 class="mt-1 text-2xl font-bold">{{ job?.title ?? 'Requirement' }}</h1>
        <p class="mt-1 text-sm text-surface-500">Candidate priority, current recruitment stage and the next recruiter action in one view.</p>
      </div>
      <button class="inline-flex items-center gap-2 rounded-lg border border-surface-300 px-3 py-2 text-sm font-medium" @click="refresh"><RefreshCw class="size-4" />Refresh</button>
    </header>

    <div v-if="status === 'pending'" class="py-10 text-center text-surface-400">Loading work queue…</div>
    <div v-else class="overflow-x-auto rounded-xl border border-surface-200 bg-white dark:border-surface-800 dark:bg-surface-900">
      <table class="min-w-full text-sm">
        <thead class="bg-surface-50 text-left text-xs uppercase tracking-wide text-surface-500 dark:bg-surface-800/60">
          <tr>
            <th class="px-4 py-3">Rank</th>
            <th class="px-4 py-3">Candidate</th>
            <th class="px-4 py-3">Priority</th>
            <th class="px-4 py-3">Score</th>
            <th class="px-4 py-3">Current Fit</th>
            <th class="px-4 py-3">Recruitment Status</th>
            <th class="px-4 py-3">Next Action</th>
            <th class="px-4 py-3">Main Gap</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-surface-100 dark:divide-surface-800">
          <tr v-for="row in data?.ranking ?? []" :key="row.applicationId" class="hover:bg-surface-50 dark:hover:bg-surface-800/30">
            <td class="px-4 py-3 font-semibold">{{ row.rank }}</td>
            <td class="px-4 py-3 min-w-[220px]">
              <NuxtLink :to="localePath(`/dashboard/recruitment/${row.applicationId}`)" class="inline-flex items-center gap-1.5 font-semibold text-brand-600 hover:underline"><ClipboardList class="size-3.5" />{{ row.candidate }}</NuxtLink>
              <div class="text-xs text-surface-400">{{ row.email }}</div>
              <div v-if="row.needsReassessment" class="mt-1 text-xs font-semibold text-warning-600">Requirement changed — reassessment required</div>
            </td>
            <td class="px-4 py-3 font-semibold">{{ row.priority ?? '—' }}</td>
            <td class="px-4 py-3">{{ row.provisionalFitScore ?? '—' }}</td>
            <td class="px-4 py-3 min-w-[150px]">{{ label(row.currentFit) }}</td>
            <td class="px-4 py-3 min-w-[170px]">{{ label(row.lastStatus) }}</td>
            <td class="px-4 py-3 min-w-[250px] font-medium text-surface-700 dark:text-surface-200">{{ row.nextAction ?? 'Open recruitment workflow' }}</td>
            <td class="px-4 py-3 min-w-[200px]">{{ row.mainGap ?? '—' }}</td>
          </tr>
          <tr v-if="!(data?.ranking?.length)"><td colspan="8" class="px-4 py-10 text-center text-surface-400">No candidates linked to this requirement.</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
