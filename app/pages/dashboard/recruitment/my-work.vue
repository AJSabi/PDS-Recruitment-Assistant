<script setup lang="ts">
import { AlertTriangle, BriefcaseBusiness, ClipboardList, RefreshCw, Search, UserRound } from 'lucide-vue-next'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'require-org'] })
useSeoMeta({ title: 'My Recruitment Work' })

const localePath = useLocalePath()
const search = ref('')
const stageFilter = ref('active')
const ageingFilter = ref('all')
const { data, status, refresh } = useFetch('/api/recruitment/my-work', {
  key: 'pds-my-recruitment-work',
  headers: useRequestHeaders(['cookie']),
})

function label(value?: string | null) {
  return (value ?? '—').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
}

const filtered = computed(() => {
  let rows = [...(data.value?.work ?? [])]
  if (stageFilter.value === 'active') rows = rows.filter((row: any) => row.active)
  else if (stageFilter.value !== 'all') rows = rows.filter((row: any) => row.lastStatus === stageFilter.value)
  if (ageingFilter.value === '3') rows = rows.filter((row: any) => row.daysInStage >= 3)
  if (ageingFilter.value === '7') rows = rows.filter((row: any) => row.daysInStage >= 7)
  const q = search.value.trim().toLowerCase()
  if (q) rows = rows.filter((row: any) => [row.candidate, row.email, row.jobTitle, row.currentFit, row.lastStatus, row.nextAction, row.priority]
    .some(v => String(v ?? '').toLowerCase().includes(q)))
  return rows
})
</script>

<template>
  <div class="mx-auto max-w-7xl">
    <header class="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-xs font-medium uppercase tracking-wide text-surface-400">PDS Recruitment</p>
        <h1 class="mt-1 text-2xl font-bold">My Work</h1>
        <p class="mt-1 text-sm text-surface-500">Assigned candidates, pending actions and stage ageing for {{ data?.user?.name ?? 'the logged-in recruiter' }}.</p>
      </div>
      <div class="flex gap-2">
        <NuxtLink :to="localePath('/dashboard/recruitment')" class="inline-flex items-center gap-2 rounded-lg border border-surface-300 px-3 py-2 text-sm font-medium"><BriefcaseBusiness class="size-4" />Operations</NuxtLink>
        <button class="inline-flex items-center gap-2 rounded-lg border border-surface-300 px-3 py-2 text-sm font-medium" @click="refresh"><RefreshCw class="size-4" />Refresh</button>
      </div>
    </header>

    <div v-if="status === 'pending'" class="py-12 text-center text-surface-400">Loading My Work…</div>
    <template v-else>
      <div class="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <div class="rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900"><p class="text-xs text-surface-400">Owned Jobs</p><p class="mt-1 text-2xl font-bold">{{ data?.summary?.ownedRequirements ?? 0 }}</p></div>
        <div class="rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900"><p class="text-xs text-surface-400">Active</p><p class="mt-1 text-2xl font-bold">{{ data?.summary?.activeCandidates ?? 0 }}</p></div>
        <div class="rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900"><p class="text-xs text-surface-400">Not Assessed</p><p class="mt-1 text-2xl font-bold">{{ data?.summary?.notYetAssessed ?? 0 }}</p></div>
        <div class="rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900"><p class="text-xs text-surface-400">Screening</p><p class="mt-1 text-2xl font-bold">{{ data?.summary?.screening ?? 0 }}</p></div>
        <div class="rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900"><p class="text-xs text-surface-400">HOD</p><p class="mt-1 text-2xl font-bold">{{ data?.summary?.hod ?? 0 }}</p></div>
        <div class="rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900"><p class="text-xs text-surface-400">Offer</p><p class="mt-1 text-2xl font-bold">{{ data?.summary?.offer ?? 0 }}</p></div>
        <div class="rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900"><p class="text-xs text-surface-400">3+ Days</p><p class="mt-1 text-2xl font-bold">{{ data?.summary?.ageing3Plus ?? 0 }}</p></div>
        <div class="rounded-xl border border-warning-200 bg-warning-50 p-4 dark:border-warning-800 dark:bg-warning-950/20"><p class="text-xs text-warning-700">7+ Days</p><p class="mt-1 text-2xl font-bold">{{ data?.summary?.ageing7Plus ?? 0 }}</p></div>
      </div>

      <div class="mb-4 grid gap-3 md:grid-cols-[1fr_auto_auto]">
        <div class="flex items-center rounded-lg border border-surface-300 bg-white px-3 dark:border-surface-700 dark:bg-surface-900"><Search class="size-4 text-surface-400" /><input v-model="search" class="w-full bg-transparent px-2 py-2.5 text-sm outline-none" placeholder="Search candidate, job, status, fit or next action" /></div>
        <select v-model="stageFilter" class="rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-900">
          <option value="active">Active only</option><option value="all">All assigned</option><option value="candidate_added">Candidate Added</option><option value="resume_received">Resume Received</option><option value="resume_reviewed">Resume Reviewed</option><option value="recruiter_screening_pending">Screening Pending</option><option value="recruiter_screening_completed">Screening Completed</option><option value="hod_round_pending">HOD Pending</option><option value="hod_round_completed">HOD Completed</option><option value="hold_for_comparison">Hold</option><option value="reassess">Reassess</option><option value="offer_stage">Offer Stage</option><option value="offer_accepted">Offer Accepted</option>
        </select>
        <select v-model="ageingFilter" class="rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-900"><option value="all">Any stage age</option><option value="3">3+ days in stage</option><option value="7">7+ days in stage</option></select>
      </div>

      <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white dark:border-surface-800 dark:bg-surface-900">
        <table class="min-w-full text-sm">
          <thead class="bg-surface-50 text-left text-xs uppercase tracking-wide text-surface-500 dark:bg-surface-800/60"><tr><th class="px-4 py-3">Candidate</th><th class="px-4 py-3">Requirement</th><th class="px-4 py-3">Priority</th><th class="px-4 py-3">Current Fit</th><th class="px-4 py-3">Status</th><th class="px-4 py-3">Days in Stage</th><th class="px-4 py-3">Next Action</th></tr></thead>
          <tbody class="divide-y divide-surface-100 dark:divide-surface-800">
            <tr v-for="row in filtered" :key="row.applicationId" class="hover:bg-surface-50 dark:hover:bg-surface-800/30">
              <td class="px-4 py-3 min-w-[220px]"><NuxtLink :to="localePath(`/dashboard/recruitment/${row.applicationId}`)" class="inline-flex items-center gap-1.5 font-semibold text-brand-600 hover:underline"><UserRound class="size-3.5" />{{ row.candidate }}</NuxtLink><div class="text-xs text-surface-400">{{ row.email }}</div></td>
              <td class="px-4 py-3 min-w-[200px]"><NuxtLink :to="localePath(`/dashboard/jobs/${row.jobId}/pds-ranking`)" class="font-medium hover:text-brand-600">{{ row.jobTitle }}</NuxtLink></td>
              <td class="px-4 py-3 font-semibold">{{ row.priority ?? '—' }}</td>
              <td class="px-4 py-3 min-w-[150px]">{{ label(row.currentFit) }}</td>
              <td class="px-4 py-3 min-w-[170px]">{{ label(row.lastStatus) }}</td>
              <td class="px-4 py-3"><span :class="row.daysInStage >= 7 ? 'font-semibold text-warning-700' : row.daysInStage >= 3 ? 'font-medium text-surface-700' : 'text-surface-500'">{{ row.daysInStage }}</span></td>
              <td class="px-4 py-3 min-w-[280px]">{{ row.nextAction }}</td>
            </tr>
            <tr v-if="!filtered.length"><td colspan="7" class="px-4 py-10 text-center text-surface-400">No assigned work matches these filters.</td></tr>
          </tbody>
        </table>
      </div>
      <p class="mt-3 text-xs text-surface-400"><AlertTriangle class="mr-1 inline size-3" />3+ and 7+ day indicators show stage ageing only; they are not configured SLA breaches.</p>
    </template>
  </div>
</template>
