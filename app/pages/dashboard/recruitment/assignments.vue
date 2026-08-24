<script setup lang="ts">
import { RefreshCw, Search, UsersRound } from 'lucide-vue-next'
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'require-org'] })
useSeoMeta({ title: 'Recruitment Assignments' })
const localePath = useLocalePath()
const search = ref('')
const recruiterFilter = ref('all')
const activeOnly = ref(true)
const busy = ref<string | null>(null)
const toast = useToast()
const { data, status, refresh } = useFetch('/api/recruitment/assignments', { key: 'pds-recruitment-assignments', headers: useRequestHeaders(['cookie']) })
const recruiters = computed<any[]>(() => data.value?.recruiters ?? [])
function label(v?: string | null) { return (v ?? '—').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase()) }
const filtered = computed(() => {
  let rows = [...(data.value?.assignments ?? [])]
  if (activeOnly.value) rows = rows.filter((r: any) => r.active)
  if (recruiterFilter.value === 'unassigned') rows = rows.filter((r: any) => !r.assignedRecruiterId)
  else if (recruiterFilter.value !== 'all') rows = rows.filter((r: any) => r.assignedRecruiterId === recruiterFilter.value)
  const q = search.value.trim().toLowerCase()
  if (q) rows = rows.filter((r: any) => [r.candidate,r.email,r.jobTitle,r.lastStatus,r.currentFit,r.nextAction,r.priority].some(v => String(v ?? '').toLowerCase().includes(q)))
  return rows
})
async function assign(applicationId: string, recruiterUserId: string) {
  busy.value = applicationId
  try {
    await $fetch(`/api/applications/${applicationId}/recruiter`, { method: 'PUT', body: { recruiterUserId: recruiterUserId || null } })
    toast.success(recruiterUserId ? 'Recruiter assigned' : 'Candidate unassigned')
    await refresh()
  } catch (err: any) { toast.error('Assignment failed', { message: err?.data?.statusMessage ?? err?.message }) }
  finally { busy.value = null }
}
</script>
<template>
  <div class="mx-auto max-w-7xl">
    <header class="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div><p class="text-xs font-medium uppercase tracking-wide text-surface-400">PDS Recruitment Operations</p><h1 class="mt-1 text-2xl font-bold">Candidate Assignments</h1><p class="mt-1 text-sm text-surface-500">Distribute active candidate workload across recruiters and identify unassigned work.</p></div>
      <div class="flex gap-2"><NuxtLink :to="localePath('/dashboard/recruitment/my-work')" class="rounded-lg border border-surface-300 px-3 py-2 text-sm font-medium">My Work</NuxtLink><NuxtLink :to="localePath('/dashboard/recruitment/workload')" class="rounded-lg border border-surface-300 px-3 py-2 text-sm font-medium">Workload</NuxtLink><button class="inline-flex items-center gap-2 rounded-lg border border-surface-300 px-3 py-2 text-sm font-medium" @click="refresh"><RefreshCw class="size-4" />Refresh</button></div>
    </header>
    <div v-if="status === 'pending'" class="py-12 text-center text-surface-400">Loading assignments…</div>
    <template v-else>
      <div class="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div class="rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900"><p class="text-xs text-surface-400">Active</p><p class="mt-1 text-2xl font-bold">{{ data?.summary?.active ?? 0 }}</p></div>
        <div class="rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900"><p class="text-xs text-surface-400">Assigned</p><p class="mt-1 text-2xl font-bold">{{ data?.summary?.assigned ?? 0 }}</p></div>
        <div class="rounded-xl border border-warning-200 bg-warning-50 p-4 dark:border-warning-800 dark:bg-warning-950/20"><p class="text-xs text-warning-700">Unassigned</p><p class="mt-1 text-2xl font-bold">{{ data?.summary?.unassigned ?? 0 }}</p></div>
        <div class="rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900"><p class="text-xs text-surface-400">Recruiters</p><p class="mt-1 text-2xl font-bold">{{ recruiters.length }}</p></div>
        <div class="rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900"><p class="text-xs text-surface-400">3+ Days</p><p class="mt-1 text-2xl font-bold">{{ data?.summary?.ageing3Plus ?? 0 }}</p></div>
        <div class="rounded-xl border border-warning-200 bg-warning-50 p-4 dark:border-warning-800 dark:bg-warning-950/20"><p class="text-xs text-warning-700">7+ Days</p><p class="mt-1 text-2xl font-bold">{{ data?.summary?.ageing7Plus ?? 0 }}</p></div>
      </div>
      <div class="mb-4 grid gap-3 md:grid-cols-[1fr_240px_auto]">
        <div class="flex items-center rounded-lg border border-surface-300 bg-white px-3 dark:border-surface-700 dark:bg-surface-900"><Search class="size-4 text-surface-400" /><input v-model="search" class="w-full bg-transparent px-2 py-2.5 text-sm outline-none" placeholder="Search candidate, requirement, stage or next action" /></div>
        <select v-model="recruiterFilter" class="rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-900"><option value="all">All recruiters</option><option value="unassigned">Unassigned</option><option v-for="r in recruiters" :key="r.id" :value="r.id">{{ r.name }}</option></select>
        <label class="flex items-center gap-2 rounded-lg border border-surface-300 px-3 text-sm"><input v-model="activeOnly" type="checkbox" />Active only</label>
      </div>
      <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white dark:border-surface-800 dark:bg-surface-900">
        <table class="min-w-full text-sm">
          <thead class="bg-surface-50 text-left text-xs uppercase tracking-wide text-surface-500 dark:bg-surface-800/60"><tr><th class="px-4 py-3">Candidate</th><th class="px-4 py-3">Requirement</th><th class="px-4 py-3">Recruiter</th><th class="px-4 py-3">Stage</th><th class="px-4 py-3">Fit</th><th class="px-4 py-3">Priority</th><th class="px-4 py-3">Days</th><th class="px-4 py-3">Next Action</th></tr></thead>
          <tbody class="divide-y divide-surface-100 dark:divide-surface-800">
            <tr v-for="row in filtered" :key="row.applicationId" class="hover:bg-surface-50 dark:hover:bg-surface-800/30">
              <td class="px-4 py-3 min-w-[210px]"><NuxtLink :to="localePath(`/dashboard/recruitment/${row.applicationId}`)" class="font-semibold text-brand-600 hover:underline">{{ row.candidate }}</NuxtLink><div class="text-xs text-surface-400">{{ row.email }}</div></td>
              <td class="px-4 py-3 min-w-[190px]"><NuxtLink :to="localePath(`/dashboard/jobs/${row.jobId}/pds-ranking`)" class="font-medium hover:text-brand-600">{{ row.jobTitle }}</NuxtLink></td>
              <td class="px-4 py-3 min-w-[190px]"><select :value="row.assignedRecruiterId ?? ''" :disabled="busy === row.applicationId" class="w-full rounded-lg border border-surface-300 bg-white px-2 py-1.5 text-xs dark:border-surface-700 dark:bg-surface-900" @change="assign(row.applicationId, ($event.target as HTMLSelectElement).value)"><option value="">Unassigned</option><option v-for="r in recruiters" :key="r.id" :value="r.id">{{ r.name }}</option></select></td>
              <td class="px-4 py-3 min-w-[160px]">{{ label(row.lastStatus) }}</td><td class="px-4 py-3 min-w-[140px]">{{ label(row.currentFit) }}</td><td class="px-4 py-3 font-semibold">{{ row.priority ?? '—' }}</td><td class="px-4 py-3"><span :class="row.daysInStage >= 7 ? 'font-semibold text-warning-700' : ''">{{ row.daysInStage }}</span></td><td class="px-4 py-3 min-w-[260px]">{{ row.nextAction }}</td>
            </tr>
            <tr v-if="!filtered.length"><td colspan="8" class="px-4 py-10 text-center text-surface-400">No matching assignments.</td></tr>
          </tbody>
        </table>
      </div>
      <p class="mt-3 text-xs text-surface-400"><UsersRound class="mr-1 inline size-3" />3+ and 7+ days are stage-ageing indicators, not SLA breach rules.</p>
    </template>
  </div>
</template>
