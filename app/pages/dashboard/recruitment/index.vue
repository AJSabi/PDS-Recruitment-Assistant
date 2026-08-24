<script setup lang="ts">
import { AlertTriangle, BriefcaseBusiness, CheckCircle2, ClipboardList, RefreshCw, Search, UsersRound } from 'lucide-vue-next'
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'require-org'] })
useSeoMeta({ title: 'Recruitment Operations' })

const localePath = useLocalePath()
const search = ref('')
const { data, status, refresh } = useFetch('/api/recruitment/overview', {
  key: 'pds-recruitment-overview',
  headers: useRequestHeaders(['cookie']),
})

const filtered = computed(() => {
  const rows = data.value?.requirements ?? []
  const q = search.value.trim().toLowerCase()
  if (!q) return rows
  return rows.filter((row: any) => [row.title, row.location, row.status].some(v => String(v ?? '').toLowerCase().includes(q)))
})

function formatDate(value?: string | Date | null) {
  return value ? new Date(value).toLocaleDateString() : '—'
}
</script>

<template>
  <div class="mx-auto max-w-7xl">
    <header class="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-xs font-medium uppercase tracking-wide text-surface-400">PDS Recruitment Operations</p>
        <h1 class="mt-1 text-2xl font-bold">Recruitment Dashboard</h1>
        <p class="mt-1 text-sm text-surface-500">Requirement health, candidate workload and pending recruiter actions across the organisation.</p>
      </div>
      <button class="inline-flex items-center gap-2 rounded-lg border border-surface-300 px-3 py-2 text-sm font-medium" @click="refresh"><RefreshCw class="size-4" />Refresh</button>
    </header>

    <div v-if="status === 'pending'" class="py-12 text-center text-surface-400">Loading recruitment operations…</div>
    <template v-else>
      <div class="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div class="rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900"><div class="flex items-center gap-2 text-surface-500"><BriefcaseBusiness class="size-4" /><span class="text-xs uppercase">Requirements</span></div><p class="mt-2 text-2xl font-bold">{{ data?.summary?.activeRequirements ?? 0 }}</p></div>
        <div class="rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900"><div class="flex items-center gap-2 text-surface-500"><UsersRound class="size-4" /><span class="text-xs uppercase">Candidates</span></div><p class="mt-2 text-2xl font-bold">{{ data?.summary?.totalCandidates ?? 0 }}</p></div>
        <div class="rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900"><div class="flex items-center gap-2 text-brand-600"><ClipboardList class="size-4" /><span class="text-xs uppercase">Active</span></div><p class="mt-2 text-2xl font-bold">{{ data?.summary?.activeCandidates ?? 0 }}</p></div>
        <div class="rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900"><div class="flex items-center gap-2 text-warning-600"><AlertTriangle class="size-4" /><span class="text-xs uppercase">Not Assessed</span></div><p class="mt-2 text-2xl font-bold">{{ data?.summary?.notYetAssessed ?? 0 }}</p></div>
        <div class="rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900"><div class="flex items-center gap-2 text-warning-600"><AlertTriangle class="size-4" /><span class="text-xs uppercase">Reassess Jobs</span></div><p class="mt-2 text-2xl font-bold">{{ data?.summary?.reassessmentRequirements ?? 0 }}</p></div>
        <div class="rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900"><div class="flex items-center gap-2 text-success-600"><CheckCircle2 class="size-4" /><span class="text-xs uppercase">Offer Stage</span></div><p class="mt-2 text-2xl font-bold">{{ data?.summary?.offers ?? 0 }}</p></div>
      </div>

      <div class="mb-4 flex items-center rounded-lg border border-surface-300 bg-white px-3 dark:border-surface-700 dark:bg-surface-900"><Search class="size-4 text-surface-400" /><input v-model="search" class="w-full bg-transparent px-2 py-2.5 text-sm outline-none" placeholder="Search requirement or location" /></div>

      <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white dark:border-surface-800 dark:bg-surface-900">
        <table class="min-w-full text-sm">
          <thead class="bg-surface-50 text-left text-xs uppercase tracking-wide text-surface-500 dark:bg-surface-800/60"><tr><th class="px-4 py-3">Requirement</th><th class="px-4 py-3">Candidates</th><th class="px-4 py-3">Assessed</th><th class="px-4 py-3">Not Assessed</th><th class="px-4 py-3">Screening</th><th class="px-4 py-3">HOD</th><th class="px-4 py-3">Offer</th><th class="px-4 py-3">Pending Actions</th><th class="px-4 py-3">Framework</th><th class="px-4 py-3">Last Activity</th></tr></thead>
          <tbody class="divide-y divide-surface-100 dark:divide-surface-800">
            <tr v-for="row in filtered" :key="row.id" class="hover:bg-surface-50 dark:hover:bg-surface-800/30">
              <td class="px-4 py-3 min-w-[240px]"><NuxtLink :to="localePath(`/dashboard/jobs/${row.id}/pds-ranking`)" class="font-semibold text-brand-600 hover:underline">{{ row.title }}</NuxtLink><div class="text-xs text-surface-400">{{ row.location || 'Location not specified' }} · {{ row.status }}</div><div v-if="row.reassessmentRequired" class="mt-1 text-xs font-semibold text-warning-600">Requirement change requires reassessment</div></td>
              <td class="px-4 py-3 font-semibold">{{ row.totalCandidates }}</td><td class="px-4 py-3">{{ row.assessed }}</td><td class="px-4 py-3">{{ row.notYetAssessed }}</td><td class="px-4 py-3">{{ row.screening }}</td><td class="px-4 py-3">{{ row.hod }}</td><td class="px-4 py-3">{{ row.offer }}</td><td class="px-4 py-3 font-semibold">{{ row.pendingActions }}</td>
              <td class="px-4 py-3 min-w-[150px]"><span :class="row.skillMatrixApproved ? 'text-success-600' : 'text-warning-600'" class="font-medium">{{ row.skillMatrixApproved ? 'Matrix Approved' : 'Matrix Pending' }}</span><div class="text-xs text-surface-400">Revision {{ row.requirementRevision }}</div></td>
              <td class="px-4 py-3 whitespace-nowrap">{{ formatDate(row.lastActivityAt) }}</td>
            </tr>
            <tr v-if="!filtered.length"><td colspan="10" class="px-4 py-10 text-center text-surface-400">No matching active requirements.</td></tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
