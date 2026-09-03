<script setup lang="ts">
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Loader2,
  MapPin,
  Plus,
  Search,
  SlidersHorizontal,
  UsersRound,
} from '@lucide/vue'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'require-org'] })
useSeoMeta({ title: 'Requirements', description: 'PDS recruitment requirements' })

const localePath = useLocalePath()
const { jobs, fetchStatus, error, refresh } = useJobs()
const { data: scope } = useFetch('/api/recruitment-scope', {
  key: 'pds-requirements-scope',
  headers: useRequestHeaders(['cookie']),
})

const canManage = computed(() => Boolean(scope.value?.canManageRequirements))
const search = ref('')
const statusFilter = ref<'all' | 'open' | 'draft' | 'closed'>('all')

function reload() { void refresh() }

function activeCandidates(pipeline: any) {
  return (pipeline?.new ?? 0) + (pipeline?.screening ?? 0) + (pipeline?.interview ?? 0) + (pipeline?.offer ?? 0)
}

function formatDate(value?: string | Date | null) {
  if (!value) return 'Not set'
  return new Date(value).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

const filteredJobs = computed<any[]>(() => {
  const q = search.value.trim().toLowerCase()
  return jobs.value.filter((item: any) => {
    if (statusFilter.value !== 'all' && item.status !== statusFilter.value) return false
    if (!q) return true
    return `${item.title ?? ''} ${item.location ?? ''} ${item.description ?? ''}`.toLowerCase().includes(q)
  })
})

const summary = computed(() => ({
  open: jobs.value.filter((item: any) => item.status === 'open').length,
  activeCandidates: jobs.value.reduce((sum: number, item: any) => sum + activeCandidates(item.pipeline), 0),
  interviews: jobs.value.reduce((sum: number, item: any) => sum + (item.pipeline?.interview ?? 0), 0),
  offers: jobs.value.reduce((sum: number, item: any) => sum + (item.pipeline?.offer ?? 0), 0),
}))

const statusClasses: Record<string, string> = {
  open: 'bg-[#E9F8F6] text-[#147A76] border-[#CDE9E6]',
  draft: 'bg-[#FFF7E8] text-[#936311] border-[#F0DFC0]',
  closed: 'bg-surface-100 text-surface-600 border-surface-200',
  archived: 'bg-surface-100 text-surface-400 border-surface-200',
}
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-6">
    <section class="relative overflow-hidden rounded-3xl bg-[#102A43] px-6 py-7 text-white shadow-sm sm:px-8">
      <div class="absolute -right-20 -top-24 size-72 rounded-full bg-[#2E86C1]/20 blur-3xl" />
      <div class="absolute -bottom-28 right-40 size-64 rounded-full bg-[#22A6A1]/15 blur-3xl" />
      <div class="relative flex flex-wrap items-start justify-between gap-5">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-[#9FD3F2]">PDS Recruitment</p>
          <h1 class="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{{ canManage ? 'Recruitment Requirements' : 'My Requirements' }}</h1>
          <p class="mt-2 max-w-2xl text-sm leading-6 text-[#D5E6F3]">
            {{ canManage ? 'Manage active hiring requirements, candidate movement and closure progress.' : 'Only requirements allocated to you are shown here.' }}
          </p>
        </div>
        <div class="flex gap-2">
          <NuxtLink v-if="canManage" :to="localePath('/dashboard/requirement-allocations')" class="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white no-underline hover:bg-white/15">
            <UsersRound class="size-4" />Manage Allocations
          </NuxtLink>
          <NuxtLink v-if="canManage" :to="localePath('/dashboard/jobs/new')" class="inline-flex items-center gap-2 rounded-xl bg-[#2E86C1] px-4 py-2.5 text-sm font-semibold text-white no-underline hover:bg-[#2677AD]">
            <Plus class="size-4" />New Requirement
          </NuxtLink>
        </div>
      </div>
    </section>

    <section class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div class="rounded-2xl border border-[#CFE0ED] bg-white p-4 shadow-sm dark:border-surface-800 dark:bg-surface-900">
        <BriefcaseBusiness class="size-5 text-[#1F6FA3]" /><p class="mt-3 text-2xl font-bold text-[#102A43] dark:text-white">{{ summary.open }}</p><p class="text-xs font-semibold text-surface-500">Open Requirements</p>
      </div>
      <div class="rounded-2xl border border-[#D7E9E7] bg-white p-4 shadow-sm dark:border-surface-800 dark:bg-surface-900">
        <UsersRound class="size-5 text-[#16847F]" /><p class="mt-3 text-2xl font-bold text-[#102A43] dark:text-white">{{ summary.activeCandidates }}</p><p class="text-xs font-semibold text-surface-500">Candidates in Recruitment</p>
      </div>
      <div class="rounded-2xl border border-[#E2E7EC] bg-white p-4 shadow-sm dark:border-surface-800 dark:bg-surface-900">
        <CalendarDays class="size-5 text-[#486581]" /><p class="mt-3 text-2xl font-bold text-[#102A43] dark:text-white">{{ summary.interviews }}</p><p class="text-xs font-semibold text-surface-500">Interview Stage</p>
      </div>
      <div class="rounded-2xl border border-[#F0DFC0] bg-white p-4 shadow-sm dark:border-surface-800 dark:bg-surface-900">
        <CheckCircle2 class="size-5 text-[#A96F12]" /><p class="mt-3 text-2xl font-bold text-[#102A43] dark:text-white">{{ summary.offers }}</p><p class="text-xs font-semibold text-surface-500">Offer Stage</p>
      </div>
    </section>

    <section class="rounded-2xl border border-surface-200 bg-white shadow-sm dark:border-surface-800 dark:bg-surface-900">
      <div class="flex flex-wrap items-center gap-3 border-b border-surface-100 p-4 dark:border-surface-800">
        <label class="relative min-w-[260px] flex-1">
          <Search class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-surface-400" />
          <input v-model="search" type="search" placeholder="Search requirement or location" class="w-full rounded-xl border border-surface-200 bg-surface-50 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-[#82B8D8] focus:bg-white dark:border-surface-700 dark:bg-surface-800" />
        </label>
        <div class="flex items-center gap-2">
          <SlidersHorizontal class="size-4 text-surface-400" />
          <select v-model="statusFilter" class="rounded-xl border border-surface-200 bg-white px-3 py-2.5 text-sm dark:border-surface-700 dark:bg-surface-900">
            <option value="all">All status</option><option value="open">Open</option><option value="draft">Draft</option><option value="closed">Closed</option>
          </select>
        </div>
      </div>

      <div v-if="fetchStatus === 'pending'" class="flex items-center justify-center py-16 text-surface-400"><Loader2 class="mr-2 size-5 animate-spin" />Loading requirements…</div>
      <div v-else-if="error" class="p-6 text-center"><AlertTriangle class="mx-auto size-6 text-danger-500" /><p class="mt-2 text-sm text-danger-600">Requirements could not be loaded.</p><button class="mt-3 text-sm font-semibold text-[#1F6FA3]" @click="reload">Retry</button></div>

      <div v-else-if="filteredJobs.length" class="divide-y divide-surface-100 dark:divide-surface-800">
        <NuxtLink v-for="item in filteredJobs" :key="item.id" :to="localePath(`/dashboard/jobs/${item.id}`)" class="group grid gap-4 px-5 py-5 no-underline transition hover:bg-[#F7FBFE] lg:grid-cols-[1.2fr_.8fr_auto] lg:items-center dark:hover:bg-surface-800/40">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="truncate text-base font-bold text-[#102A43] group-hover:text-[#1F6FA3] dark:text-white">{{ item.title }}</h2>
              <span class="rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize" :class="statusClasses[item.status] ?? statusClasses.archived">{{ item.status }}</span>
            </div>
            <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-surface-500">
              <span v-if="item.location" class="inline-flex items-center gap-1"><MapPin class="size-3.5" />{{ item.location }}</span>
              <span class="inline-flex items-center gap-1"><Clock3 class="size-3.5" />Created {{ formatDate(item.createdAt) }}</span>
            </div>
          </div>

          <div class="grid grid-cols-4 gap-2 text-center">
            <div class="rounded-lg bg-[#EAF4FB] px-2 py-2 dark:bg-brand-950/30"><p class="text-base font-bold text-[#1F6FA3]">{{ item.pipeline?.new ?? 0 }}</p><p class="text-[10px] text-surface-500">New</p></div>
            <div class="rounded-lg bg-[#EDF3F7] px-2 py-2 dark:bg-surface-800"><p class="text-base font-bold text-[#486581]">{{ item.pipeline?.screening ?? 0 }}</p><p class="text-[10px] text-surface-500">Screening</p></div>
            <div class="rounded-lg bg-[#E9F8F6] px-2 py-2 dark:bg-accent-950/30"><p class="text-base font-bold text-[#16847F]">{{ item.pipeline?.interview ?? 0 }}</p><p class="text-[10px] text-surface-500">Interview</p></div>
            <div class="rounded-lg bg-[#FFF7E8] px-2 py-2 dark:bg-warning-950/20"><p class="text-base font-bold text-[#A96F12]">{{ item.pipeline?.offer ?? 0 }}</p><p class="text-[10px] text-surface-500">Offer</p></div>
          </div>

          <span class="inline-flex items-center gap-1 text-sm font-semibold text-[#1F6FA3]">Open workspace <ArrowRight class="size-4 transition group-hover:translate-x-0.5" /></span>
        </NuxtLink>
      </div>

      <div v-else class="px-6 py-16 text-center">
        <BriefcaseBusiness class="mx-auto size-8 text-[#82B8D8]" />
        <h2 class="mt-3 font-bold text-[#102A43] dark:text-white">{{ jobs.length ? 'No requirements match your search' : (canManage ? 'No requirements yet' : 'No requirements allocated yet') }}</h2>
        <p class="mx-auto mt-2 max-w-md text-sm text-surface-500">{{ jobs.length ? 'Change the search or status filter.' : (canManage ? 'Create the first requirement to start recruitment.' : 'Allocated requirements will appear here automatically.') }}</p>
      </div>
    </section>
  </div>
</template>
