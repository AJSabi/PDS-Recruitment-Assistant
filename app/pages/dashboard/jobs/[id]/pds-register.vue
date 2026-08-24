<script setup lang="ts">
import { ArrowLeft, ClipboardList, Download, FileSearch, RefreshCw, Search } from 'lucide-vue-next'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'require-org'] })
const route = useRoute()
const jobId = route.params.id as string
const localePath = useLocalePath()
const search = ref('')

const { data, status, refresh } = useFetch(() => `/api/jobs/${jobId}/candidate-register`, {
  key: `pds-candidate-register-${jobId}`,
  headers: useRequestHeaders(['cookie']),
})

function label(value?: string | null) {
  return (value ?? '—').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function formatDate(value?: string | Date | null) {
  return value ? new Date(value).toLocaleDateString() : '—'
}

const filtered = computed(() => {
  const rows = data.value?.register ?? []
  const q = search.value.trim().toLowerCase()
  if (!q) return rows
  return rows.filter((row: any) => [row.candidate, row.email, row.phone, row.currentFit, row.lastStatus, row.nextAction, row.priority]
    .some(v => String(v ?? '').toLowerCase().includes(q)))
})

function csvCell(value: unknown) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

function exportCsv() {
  const headers = ['Candidate', 'Phone', 'Email', 'Last Contact', 'Resume Brief', 'Conversation Brief', 'Current Fit', 'Last Status', 'Status Date', 'Last Updated By', 'Next Action', 'Priority', 'Provisional Fit Score']
  const lines = filtered.value.map((row: any) => [
    row.candidate, row.phone, row.email, formatDate(row.lastContactAt), row.resumeBrief, row.conversationBrief,
    label(row.currentFit), label(row.lastStatus), formatDate(row.statusDate), row.lastUpdatedBy, row.nextAction,
    row.priority, row.provisionalFitScore,
  ].map(csvCell).join(','))
  const blob = new Blob([[headers.map(csvCell).join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${data.value?.requirement?.title ?? 'candidate-register'}-candidate-register.csv`.replace(/[^a-z0-9.-]+/gi, '-')
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="mx-auto max-w-7xl">
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <NuxtLink :to="localePath(`/dashboard/jobs/${jobId}`)" class="inline-flex items-center gap-1.5 rounded-lg border border-surface-300 px-3 py-1.5 text-sm font-medium text-surface-600 hover:border-brand-400 hover:text-brand-700 dark:border-surface-700 dark:text-surface-300"><ArrowLeft class="size-4" />Pipeline</NuxtLink>
      <NuxtLink :to="localePath(`/dashboard/jobs/${jobId}/ai-analysis`)" class="inline-flex items-center gap-1.5 rounded-lg border border-surface-300 px-3 py-1.5 text-sm font-medium text-surface-600 hover:border-brand-400 hover:text-brand-700 dark:border-surface-700 dark:text-surface-300"><FileSearch class="size-4" />JD & Skill Matrix</NuxtLink>
      <NuxtLink :to="localePath(`/dashboard/jobs/${jobId}/pds-ranking`)" class="inline-flex items-center gap-1.5 rounded-lg border border-surface-300 px-3 py-1.5 text-sm font-medium text-surface-600 hover:border-brand-400 hover:text-brand-700 dark:border-surface-700 dark:text-surface-300"><ClipboardList class="size-4" />Work Queue</NuxtLink>
    </div>

    <header class="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-xs font-medium uppercase tracking-wide text-surface-400">PDS Candidate Register</p>
        <h1 class="mt-1 text-2xl font-bold">{{ data?.requirement?.title ?? 'Requirement' }}</h1>
        <p class="mt-1 text-sm text-surface-500">Latest confirmed recruitment state for every candidate in this requirement.</p>
      </div>
      <div class="flex gap-2">
        <button class="inline-flex items-center gap-2 rounded-lg border border-surface-300 px-3 py-2 text-sm font-medium" @click="refresh"><RefreshCw class="size-4" />Refresh</button>
        <button class="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white" @click="exportCsv"><Download class="size-4" />Export CSV</button>
      </div>
    </header>

    <div v-if="status === 'pending'" class="py-12 text-center text-surface-400">Loading candidate register…</div>
    <template v-else>
      <div class="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div class="rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900"><p class="text-xs text-surface-400">Total Candidates</p><p class="mt-1 text-2xl font-bold">{{ data?.summary?.totalCandidates ?? 0 }}</p></div>
        <div class="rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900"><p class="text-xs text-surface-400">Assessed</p><p class="mt-1 text-2xl font-bold">{{ data?.summary?.assessed ?? 0 }}</p></div>
        <div class="rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900"><p class="text-xs text-surface-400">Not Yet Assessed</p><p class="mt-1 text-2xl font-bold">{{ data?.summary?.notYetAssessed ?? 0 }}</p></div>
        <div class="rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900"><p class="text-xs text-surface-400">Action Pending</p><p class="mt-1 text-2xl font-bold">{{ data?.summary?.actionPending ?? 0 }}</p></div>
        <div class="rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900"><p class="text-xs text-surface-400">Closed</p><p class="mt-1 text-2xl font-bold">{{ data?.summary?.closed ?? 0 }}</p></div>
      </div>

      <div class="mb-4 flex items-center rounded-lg border border-surface-300 bg-white px-3 dark:border-surface-700 dark:bg-surface-900">
        <Search class="size-4 text-surface-400" />
        <input v-model="search" class="w-full bg-transparent px-2 py-2.5 text-sm outline-none" placeholder="Search candidate, status, fit, priority or next action" />
      </div>

      <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white dark:border-surface-800 dark:bg-surface-900">
        <table class="min-w-full text-sm">
          <thead class="bg-surface-50 text-left text-xs uppercase tracking-wide text-surface-500 dark:bg-surface-800/60">
            <tr>
              <th class="px-4 py-3">Candidate</th><th class="px-4 py-3">Phone</th><th class="px-4 py-3">Last Contact</th><th class="px-4 py-3">Current Fit</th><th class="px-4 py-3">Last Status</th><th class="px-4 py-3">Status Date</th><th class="px-4 py-3">Priority</th><th class="px-4 py-3">Next Action</th><th class="px-4 py-3">Last Updated By</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface-100 dark:divide-surface-800">
            <tr v-for="row in filtered" :key="row.applicationId" class="hover:bg-surface-50 dark:hover:bg-surface-800/30">
              <td class="px-4 py-3 min-w-[220px]"><NuxtLink :to="localePath(`/dashboard/recruitment/${row.applicationId}`)" class="font-semibold text-brand-600 hover:underline">{{ row.candidate }}</NuxtLink><div class="text-xs text-surface-400">{{ row.email }}</div></td>
              <td class="px-4 py-3 whitespace-nowrap">{{ row.phone ?? '—' }}</td>
              <td class="px-4 py-3 whitespace-nowrap">{{ formatDate(row.lastContactAt) }}</td>
              <td class="px-4 py-3 min-w-[150px]">{{ label(row.currentFit) }}</td>
              <td class="px-4 py-3 min-w-[170px]">{{ label(row.lastStatus) }}</td>
              <td class="px-4 py-3 whitespace-nowrap">{{ formatDate(row.statusDate) }}</td>
              <td class="px-4 py-3 font-semibold">{{ row.priority ?? '—' }}</td>
              <td class="px-4 py-3 min-w-[260px]">{{ row.nextAction }}</td>
              <td class="px-4 py-3 min-w-[150px]">{{ row.lastUpdatedBy ?? '—' }}</td>
            </tr>
            <tr v-if="!filtered.length"><td colspan="9" class="px-4 py-10 text-center text-surface-400">No matching candidates.</td></tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
