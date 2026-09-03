<script setup lang="ts">
import { AlertTriangle, BriefcaseBusiness, FileText, RefreshCw, Search, UserCheck, UsersRound } from '@lucide/vue'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'require-org'] })
const localePath = useLocalePath()
const search = ref('')
const filter = ref<'all' | 'active' | 'database_only' | 'with_resume'>('all')

const { data, status, error, refresh } = useFetch('/api/pds/candidate-database', {
  key: 'pds-candidate-database',
  headers: useRequestHeaders(['cookie']),
})

function reload() { void refresh() }

function label(value?: string | null) {
  return (value ?? '—').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function formatDate(value?: string | Date | null) {
  return value ? new Date(value).toLocaleDateString() : '—'
}

function filterClass(value: typeof filter.value) {
  return filter.value === value
    ? 'border-brand-400 bg-brand-50 ring-2 ring-brand-100 dark:border-brand-700 dark:bg-brand-950/30 dark:ring-brand-950'
    : 'border-surface-200 bg-white dark:border-surface-800 dark:bg-surface-900'
}

const filtered = computed<any[]>(() => {
  const rows: any[] = data.value?.candidates ?? []
  const q = search.value.trim().toLowerCase()
  return rows.filter((row) => {
    if (filter.value === 'active' && !row.activeRequirements) return false
    if (filter.value === 'database_only' && row.totalRequirements) return false
    if (filter.value === 'with_resume' && !row.resumeCount) return false
    if (!q) return true
    const requirementText = (row.requirements ?? []).map((r: any) => `${r.jobTitle} ${r.recruiter ?? ''} ${r.lastStatus ?? ''} ${r.aiCandidateSummary ?? ''} ${r.aiFinalBrief ?? ''}`).join(' ')
    return [row.candidate, row.email, row.phone, row.latestJobTitle, row.assignedRecruiter, row.currentFit, row.lastStatus, row.priority, row.nextAction, row.aiCandidateSummary, row.aiFinalBrief, requirementText]
      .some(v => String(v ?? '').toLowerCase().includes(q))
  })
})
</script>

<template>
  <div class="mx-auto max-w-7xl">
    <header class="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-xs font-medium uppercase tracking-wide text-surface-400">PDS Recruitment</p>
        <h1 class="mt-1 text-2xl font-bold">Candidate Database</h1>
        <p class="mt-1 max-w-3xl text-sm text-surface-500">Organisation-wide candidate records across all requirements. Recruitment summaries remain requirement-specific and do not imply that a candidate is active in every role.</p>
      </div>
      <button class="inline-flex items-center gap-2 rounded-lg border border-surface-300 px-3 py-2 text-sm font-medium" @click="reload"><RefreshCw class="size-4" />Refresh</button>
    </header>

    <div v-if="status === 'pending'" class="py-12 text-center text-surface-400">Loading candidate database…</div>
    <div v-else-if="error" class="rounded-xl border border-danger-200 bg-danger-50 p-5 text-danger-700 dark:border-danger-900 dark:bg-danger-950/30 dark:text-danger-300">
      <div class="flex items-start gap-2"><AlertTriangle class="mt-0.5 size-5 shrink-0" /><div><p class="font-semibold">Candidate Database could not be loaded</p><p class="mt-1 text-sm">{{ (error?.data as { statusMessage?: string } | undefined)?.statusMessage ?? error?.message ?? 'The server returned an error. Refresh the page or verify your organisation access.' }}</p></div></div>
    </div>
    <template v-else>
      <div class="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <button class="rounded-xl border p-4 text-left transition" :class="filterClass('all')" @click="filter = 'all'"><div class="flex items-center gap-2 text-surface-500"><UsersRound class="size-4" /><span class="text-xs">Total Candidates</span></div><p class="mt-2 text-2xl font-bold">{{ data?.summary?.totalCandidates ?? 0 }}</p></button>
        <button class="rounded-xl border p-4 text-left transition" :class="filterClass('with_resume')" @click="filter = 'with_resume'"><div class="flex items-center gap-2 text-surface-500"><FileText class="size-4" /><span class="text-xs">Resume Available</span></div><p class="mt-2 text-2xl font-bold">{{ data?.summary?.withResume ?? 0 }}</p></button>
        <button class="rounded-xl border p-4 text-left transition" :class="filterClass('active')" @click="filter = 'active'"><div class="flex items-center gap-2 text-surface-500"><BriefcaseBusiness class="size-4" /><span class="text-xs">Active Recruitment</span></div><p class="mt-2 text-2xl font-bold">{{ data?.summary?.activeRecruitment ?? 0 }}</p></button>
        <button class="rounded-xl border p-4 text-left transition" :class="filterClass('database_only')" @click="filter = 'database_only'"><div class="flex items-center gap-2 text-surface-500"><UsersRound class="size-4" /><span class="text-xs">Database Only</span></div><p class="mt-2 text-2xl font-bold">{{ data?.summary?.databaseOnly ?? 0 }}</p></button>
        <div class="rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900"><div class="flex items-center gap-2 text-surface-500"><UserCheck class="size-4" /><span class="text-xs">Active Unassigned</span></div><p class="mt-2 text-2xl font-bold">{{ data?.summary?.unassignedActive ?? 0 }}</p></div>
      </div>

      <div class="mb-4 flex flex-wrap gap-2">
        <div class="flex min-w-0 flex-1 basis-72 items-center rounded-lg border border-surface-300 bg-white px-3 dark:border-surface-700 dark:bg-surface-900"><Search class="size-4 shrink-0 text-surface-400" /><input v-model="search" class="min-w-0 w-full bg-transparent px-2 py-2.5 text-sm outline-none" placeholder="Search candidate, requirement, recruiter, status, fit or priority" /></div>
        <button v-if="filter !== 'all'" class="rounded-lg border border-surface-300 px-3 py-2 text-sm font-medium" @click="filter = 'all'">Clear Filter</button>
      </div>

      <div v-if="!data?.summary?.totalCandidates" class="rounded-2xl border border-dashed border-surface-300 bg-surface-50 p-10 text-center dark:border-surface-700 dark:bg-surface-900">
        <p class="font-semibold text-surface-800 dark:text-white">No candidates in the central database yet</p>
        <p class="mt-1 text-sm text-surface-500">Candidates created inside a requirement or imported from resumes will appear here automatically.</p>
      </div>

      <template v-else>
        <div class="grid gap-3 lg:hidden" data-testid="candidate-database-mobile-cards">
          <article v-for="row in filtered" :key="row.candidateId" class="rounded-2xl border border-surface-200 bg-white p-4 shadow-sm dark:border-surface-800 dark:bg-surface-900">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="truncate font-bold text-surface-900 dark:text-white">{{ row.candidate }}</p>
                <p class="truncate text-xs text-surface-400">{{ row.email }}</p>
                <p class="text-xs text-surface-400">{{ row.phone ?? '—' }}</p>
              </div>
              <span v-if="row.priority" class="shrink-0 rounded-full bg-brand-50 px-2.5 py-1 text-[10px] font-bold text-brand-700 dark:bg-brand-950/30 dark:text-brand-300">{{ row.priority }}</span>
            </div>

            <div class="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div class="rounded-xl bg-surface-50 p-3 dark:bg-surface-800/50"><p class="text-[10px] font-semibold uppercase text-surface-400">Status</p><p class="mt-1 font-semibold text-surface-700 dark:text-surface-200">{{ label(row.lastStatus) }}</p></div>
              <div class="rounded-xl bg-surface-50 p-3 dark:bg-surface-800/50"><p class="text-[10px] font-semibold uppercase text-surface-400">Current Fit</p><p class="mt-1 font-semibold text-surface-700 dark:text-surface-200">{{ label(row.currentFit) }}</p></div>
              <div class="rounded-xl bg-surface-50 p-3 dark:bg-surface-800/50"><p class="text-[10px] font-semibold uppercase text-surface-400">Recruiter</p><p class="mt-1 truncate font-semibold text-surface-700 dark:text-surface-200">{{ row.assignedRecruiter ?? 'Unassigned' }}</p></div>
              <div class="rounded-xl bg-surface-50 p-3 dark:bg-surface-800/50"><p class="text-[10px] font-semibold uppercase text-surface-400">Resumes</p><p class="mt-1 font-semibold text-surface-700 dark:text-surface-200">{{ row.resumeCount ?? 0 }}</p></div>
            </div>

            <div class="mt-4 rounded-xl border border-surface-200 p-3 dark:border-surface-700">
              <p class="text-[10px] font-semibold uppercase text-surface-400">Latest / Active Requirement</p>
              <NuxtLink v-if="row.latestApplicationId" :to="localePath(`/dashboard/recruitment/${row.latestApplicationId}`)" class="mt-1 block font-semibold text-brand-600 hover:underline">{{ row.latestJobTitle }}</NuxtLink>
              <p v-else class="mt-1 text-sm text-surface-500">Not currently in recruitment</p>
              <p v-if="row.activeRequirements > 1" class="mt-1 text-xs text-surface-400">{{ row.activeRequirements }} active requirements</p>
              <p v-if="row.aiCandidateSummary" class="mt-2 line-clamp-3 text-xs leading-5 text-surface-600 dark:text-surface-300">{{ row.aiCandidateSummary }}</p>
              <p v-if="row.aiSummaryStale" class="mt-1 text-[11px] font-semibold text-warning-600">New evidence available — summary needs update</p>
            </div>

            <details v-if="row.requirements?.length" class="mt-3 rounded-xl border border-surface-200 p-3 dark:border-surface-700">
              <summary class="cursor-pointer text-sm font-semibold text-brand-600">Requirement History · {{ row.totalRequirements }}</summary>
              <div class="mt-3 space-y-2"><div v-for="item in row.requirements" :key="item.applicationId" class="rounded-lg bg-surface-50 p-2.5 dark:bg-surface-800/50"><NuxtLink :to="localePath(`/dashboard/recruitment/${item.applicationId}`)" class="font-medium text-brand-600 hover:underline">{{ item.jobTitle }}</NuxtLink><div class="mt-1 text-xs text-surface-500">{{ label(item.lastStatus) }} · {{ item.recruiter ?? 'Unassigned' }}</div><div class="mt-0.5 text-xs text-surface-400">{{ label(item.currentFit) }}<span v-if="item.priority"> · {{ item.priority }}</span></div></div></div>
            </details>
          </article>
          <div v-if="!filtered.length" class="rounded-2xl border border-dashed border-surface-300 p-8 text-center text-sm text-surface-400 dark:border-surface-700">No candidates match the current search or filter.</div>
        </div>

        <div class="hidden overflow-x-auto rounded-xl border border-surface-200 bg-white lg:block dark:border-surface-800 dark:bg-surface-900" data-testid="candidate-database-desktop-table">
          <table class="min-w-full text-sm">
            <thead class="bg-surface-50 text-left text-xs uppercase tracking-wide text-surface-500 dark:bg-surface-800/60">
              <tr><th class="px-4 py-3">Candidate</th><th class="px-4 py-3">Resume</th><th class="px-4 py-3">Latest / Active Requirement</th><th class="px-4 py-3">Recruiter</th><th class="px-4 py-3">Status</th><th class="px-4 py-3">Fit</th><th class="px-4 py-3">Priority</th><th class="px-4 py-3">Requirement History</th></tr>
            </thead>
            <tbody class="divide-y divide-surface-100 dark:divide-surface-800">
              <tr v-for="row in filtered" :key="row.candidateId" class="align-top hover:bg-surface-50 dark:hover:bg-surface-800/30">
                <td class="min-w-[230px] px-4 py-3"><div class="font-semibold">{{ row.candidate }}</div><div class="text-xs text-surface-400">{{ row.email }}</div><div class="text-xs text-surface-400">{{ row.phone ?? '—' }}</div></td>
                <td class="min-w-[160px] px-4 py-3"><div class="font-medium">{{ row.resumeCount ? `${row.resumeCount} resume${row.resumeCount === 1 ? '' : 's'}` : 'No resume' }}</div><div v-if="row.latestResumeAt" class="mt-1 text-xs text-surface-400">Latest {{ formatDate(row.latestResumeAt) }}</div></td>
                <td class="min-w-[340px] px-4 py-3">
                  <NuxtLink v-if="row.latestApplicationId" :to="localePath(`/dashboard/recruitment/${row.latestApplicationId}`)" class="font-semibold text-brand-600 hover:underline">{{ row.latestJobTitle }}</NuxtLink><span v-else class="text-surface-500">Not currently in recruitment</span>
                  <div v-if="row.activeRequirements > 1" class="mt-1 text-xs text-surface-400">{{ row.activeRequirements }} active requirements</div>
                  <p v-if="row.aiCandidateSummary" class="mt-2 line-clamp-3 text-xs leading-5 text-surface-600 dark:text-surface-300">{{ row.aiCandidateSummary }}</p>
                  <p v-if="row.aiSummaryStale" class="mt-1 text-[11px] font-semibold text-warning-600">New evidence available — summary needs update</p>
                  <p v-if="row.aiFinalBrief" class="mt-1 line-clamp-2 text-[11px] leading-4 text-accent-700 dark:text-accent-300"><strong>Final brief:</strong> {{ row.aiFinalBrief }}</p>
                </td>
                <td class="min-w-[150px] px-4 py-3">{{ row.assignedRecruiter ?? 'Unassigned' }}</td>
                <td class="min-w-[180px] px-4 py-3"><div>{{ label(row.lastStatus) }}</div><div class="mt-1 text-xs text-surface-400">{{ formatDate(row.statusDate) }}</div></td>
                <td class="min-w-[150px] px-4 py-3">{{ label(row.currentFit) }}</td>
                <td class="px-4 py-3 font-semibold">{{ row.priority ?? '—' }}</td>
                <td class="min-w-[300px] px-4 py-3">
                  <details v-if="row.requirements?.length"><summary class="cursor-pointer text-sm font-medium text-brand-600">{{ row.totalRequirements }} requirement{{ row.totalRequirements === 1 ? '' : 's' }}</summary><div class="mt-2 space-y-2"><div v-for="item in row.requirements" :key="item.applicationId" class="rounded-lg border border-surface-200 p-2 dark:border-surface-700"><NuxtLink :to="localePath(`/dashboard/recruitment/${item.applicationId}`)" class="font-medium text-brand-600 hover:underline">{{ item.jobTitle }}</NuxtLink><div class="mt-1 text-xs text-surface-500">{{ label(item.lastStatus) }} · {{ item.recruiter ?? 'Unassigned' }}</div><div class="mt-0.5 text-xs text-surface-400">{{ label(item.currentFit) }}<span v-if="item.priority"> · {{ item.priority }}</span><span v-if="item.provisionalFitScore != null"> · {{ item.provisionalFitScore }}%</span></div><p v-if="item.aiCandidateSummary" class="mt-1 line-clamp-2 text-xs text-surface-600 dark:text-surface-300">{{ item.aiCandidateSummary }}</p><p v-if="item.aiFinalBrief" class="mt-1 line-clamp-2 text-[11px] text-accent-700 dark:text-accent-300"><strong>Final brief:</strong> {{ item.aiFinalBrief }}</p></div></div></details><span v-else class="text-surface-400">No recruitment history</span>
                </td>
              </tr>
              <tr v-if="!filtered.length"><td colspan="8" class="px-4 py-10 text-center text-surface-400">No candidates match the current search or filter.</td></tr>
            </tbody>
          </table>
        </div>
      </template>
    </template>
  </div>
</template>
