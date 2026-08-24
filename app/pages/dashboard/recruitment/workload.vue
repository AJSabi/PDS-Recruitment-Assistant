<script setup lang="ts">
import { ArrowLeft, RefreshCw, UserRound, UsersRound } from 'lucide-vue-next'
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'require-org'] })
useSeoMeta({ title: 'Recruiter Workload' })
const localePath = useLocalePath()
const { data, status, refresh } = useFetch('/api/recruitment/workload', {
  key: 'pds-recruiter-workload',
  headers: useRequestHeaders(['cookie']),
})
</script>

<template>
  <div class="mx-auto max-w-7xl">
    <div class="mb-4">
      <NuxtLink :to="localePath('/dashboard/recruitment')" class="inline-flex items-center gap-1.5 rounded-lg border border-surface-300 px-3 py-1.5 text-sm font-medium text-surface-600 hover:border-brand-400 hover:text-brand-700 dark:border-surface-700 dark:text-surface-300"><ArrowLeft class="size-4" />Recruitment Dashboard</NuxtLink>
    </div>

    <header class="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div><p class="text-xs font-medium uppercase tracking-wide text-surface-400">PDS Recruitment Operations</p><h1 class="mt-1 text-2xl font-bold">Recruiter Workload</h1><p class="mt-1 text-sm text-surface-500">Active candidate ownership and stage workload by recruiter.</p></div>
      <button class="inline-flex items-center gap-2 rounded-lg border border-surface-300 px-3 py-2 text-sm font-medium" @click="refresh"><RefreshCw class="size-4" />Refresh</button>
    </header>

    <div v-if="status === 'pending'" class="py-12 text-center text-surface-400">Loading recruiter workload…</div>
    <template v-else>
      <div class="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div class="rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900"><div class="flex items-center gap-2 text-surface-500"><UsersRound class="size-4" /><span class="text-xs uppercase">Recruiters</span></div><p class="mt-2 text-2xl font-bold">{{ data?.summary?.recruiters ?? 0 }}</p></div>
        <div class="rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900"><div class="flex items-center gap-2 text-brand-600"><UserRound class="size-4" /><span class="text-xs uppercase">Active Candidates</span></div><p class="mt-2 text-2xl font-bold">{{ data?.summary?.activeCandidates ?? 0 }}</p></div>
        <div class="rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900"><p class="text-xs uppercase text-warning-600">Unassigned Candidates</p><p class="mt-2 text-2xl font-bold">{{ data?.summary?.unassignedCandidates ?? 0 }}</p></div>
        <div class="rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900"><p class="text-xs uppercase text-warning-600">Unowned Requirements</p><p class="mt-2 text-2xl font-bold">{{ data?.summary?.unownedRequirements ?? 0 }}</p></div>
      </div>

      <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white dark:border-surface-800 dark:bg-surface-900">
        <table class="min-w-full text-sm">
          <thead class="bg-surface-50 text-left text-xs uppercase tracking-wide text-surface-500 dark:bg-surface-800/60"><tr><th class="px-4 py-3">Recruiter</th><th class="px-4 py-3">Owned Requirements</th><th class="px-4 py-3">Active Candidates</th><th class="px-4 py-3">Not Assessed</th><th class="px-4 py-3">Screening</th><th class="px-4 py-3">HOD</th><th class="px-4 py-3">Offer</th><th class="px-4 py-3">Pending Actions</th></tr></thead>
          <tbody class="divide-y divide-surface-100 dark:divide-surface-800">
            <tr v-for="row in data?.recruiters ?? []" :key="row.id" class="hover:bg-surface-50 dark:hover:bg-surface-800/30"><td class="px-4 py-3 min-w-[220px]"><div class="font-semibold">{{ row.name }}</div><div class="text-xs text-surface-400">{{ row.email }}</div></td><td class="px-4 py-3">{{ row.ownedRequirements }}</td><td class="px-4 py-3 font-semibold">{{ row.activeCandidates }}</td><td class="px-4 py-3">{{ row.notYetAssessed }}</td><td class="px-4 py-3">{{ row.screening }}</td><td class="px-4 py-3">{{ row.hod }}</td><td class="px-4 py-3">{{ row.offer }}</td><td class="px-4 py-3 font-semibold">{{ row.pendingActions }}</td></tr>
            <tr v-if="!(data?.recruiters?.length)"><td colspan="8" class="px-4 py-10 text-center text-surface-400">No organization members available.</td></tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
