<script setup lang="ts">
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  Database,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
  UserRoundCheck,
  UsersRound,
} from 'lucide-vue-next'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'require-org'] })
useSeoMeta({ title: 'Recruitment Dashboard', description: 'PDS recruitment control dashboard' })

const localePath = useLocalePath()
const { activeOrg } = useCurrentOrg()
const {
  counts,
  recentApplications,
  topJobs,
  recruitment,
  scope,
  fetchStatus,
  error,
  refresh,
} = useDashboard()

const canCreateRequirement = computed(() => ['owner', 'admin'].includes(scope.value.role))
const scopeLabel = computed(() => scope.value.allocatedOnly ? 'My Recruitment Desk' : 'Recruitment Control Centre')

function formatDate(value?: string | Date | null) {
  if (!value) return 'Not set'
  return new Date(value).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

function daysTo(value?: string | Date | null) {
  if (!value) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(value)
  target.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - today.getTime()) / 86400000)
}

function closureLabel(value?: string | Date | null) {
  const days = daysTo(value)
  if (days == null) return 'Closure date not set'
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`
  if (days === 0) return 'Due today'
  if (days === 1) return '1 day remaining'
  return `${days} days remaining`
}

function stageLabel(value?: string | null) {
  return (value ?? 'candidate_added').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function candidateName(row: any) {
  return `${row.candidateFirstName ?? ''} ${row.candidateLastName ?? ''}`.trim() || 'Candidate'
}

const isEmpty = computed(() => counts.value.openJobs === 0 && counts.value.totalApplications === 0)
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-6">
    <div v-if="fetchStatus === 'pending'" class="flex min-h-[55vh] items-center justify-center">
      <div class="text-center">
        <Loader2 class="mx-auto size-7 animate-spin text-brand-600" />
        <p class="mt-3 text-sm text-surface-500">Loading recruitment dashboard…</p>
      </div>
    </div>

    <div v-else-if="error" class="rounded-2xl border border-danger-200 bg-danger-50 p-5 text-danger-800 dark:border-danger-900 dark:bg-danger-950/30 dark:text-danger-200">
      <div class="flex items-center gap-3">
        <AlertTriangle class="size-5" />
        <div><p class="font-semibold">Dashboard could not be loaded</p><p class="text-sm opacity-80">Please retry the request.</p></div>
        <button class="ml-auto inline-flex items-center gap-2 rounded-lg border border-danger-300 px-3 py-2 text-sm font-semibold" @click="refresh"><RefreshCw class="size-4" />Retry</button>
      </div>
    </div>

    <template v-else>
      <section class="relative overflow-hidden rounded-3xl bg-[#102A43] px-6 py-7 text-white shadow-sm sm:px-8 sm:py-8">
        <div class="absolute -right-20 -top-28 size-80 rounded-full bg-[#2E86C1]/20 blur-3xl" />
        <div class="absolute -bottom-24 right-36 size-64 rounded-full bg-[#22A6A1]/15 blur-3xl" />
        <div class="relative flex flex-wrap items-start justify-between gap-5">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-[#9FD3F2]">PDS Recruitment Assistant</p>
            <h1 class="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{{ scopeLabel }}</h1>
            <p class="mt-2 max-w-2xl text-sm leading-6 text-[#D5E6F3]">
              {{ scope.allocatedOnly ? 'Only requirements allocated to you are shown in this dashboard.' : `Organisation-wide recruitment view for ${activeOrg?.name ?? 'PDS'}.` }}
            </p>
          </div>
          <div class="flex gap-2">
            <NuxtLink to="/dashboard/pds-candidates" class="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white no-underline backdrop-blur hover:bg-white/15">
              <Database class="size-4" />Candidate Database
            </NuxtLink>
            <NuxtLink v-if="canCreateRequirement" :to="localePath('/dashboard/jobs/new')" class="inline-flex items-center gap-2 rounded-xl bg-[#2E86C1] px-4 py-2.5 text-sm font-semibold text-white no-underline shadow-sm hover:bg-[#2677AD]">
              <Plus class="size-4" />New Requirement
            </NuxtLink>
          </div>
        </div>
      </section>

      <section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <NuxtLink :to="localePath('/dashboard/jobs')" class="group rounded-2xl border border-[#CFE0ED] bg-white p-5 no-underline shadow-sm transition hover:-translate-y-0.5 hover:border-[#82B8D8] hover:shadow-md dark:border-surface-800 dark:bg-surface-900">
          <div class="flex items-center justify-between"><span class="flex size-10 items-center justify-center rounded-xl bg-[#EAF4FB] text-[#1F6FA3] dark:bg-brand-950"><BriefcaseBusiness class="size-5" /></span><ArrowRight class="size-4 text-surface-300 transition group-hover:translate-x-0.5 group-hover:text-[#1F6FA3]" /></div>
          <p class="mt-5 text-3xl font-bold text-[#102A43] dark:text-white">{{ counts.openJobs }}</p>
          <p class="mt-1 text-sm font-semibold text-surface-700 dark:text-surface-200">{{ scope.allocatedOnly ? 'My Open Requirements' : 'Open Requirements' }}</p>
          <p class="mt-1 text-xs text-surface-400">Active hiring requirements</p>
        </NuxtLink>

        <div class="rounded-2xl border border-[#D7E9E7] bg-white p-5 shadow-sm dark:border-surface-800 dark:bg-surface-900">
          <span class="flex size-10 items-center justify-center rounded-xl bg-[#E9F8F6] text-[#16847F] dark:bg-accent-950"><UsersRound class="size-5" /></span>
          <p class="mt-5 text-3xl font-bold text-[#102A43] dark:text-white">{{ counts.totalCandidates }}</p>
          <p class="mt-1 text-sm font-semibold text-surface-700 dark:text-surface-200">Active Candidates</p>
          <p class="mt-1 text-xs text-surface-400">Across visible requirements</p>
        </div>

        <NuxtLink :to="localePath('/dashboard/actions')" class="group rounded-2xl border border-[#F0DFC0] bg-white p-5 no-underline shadow-sm transition hover:-translate-y-0.5 hover:border-[#D8B86B] hover:shadow-md dark:border-surface-800 dark:bg-surface-900">
          <div class="flex items-center justify-between"><span class="flex size-10 items-center justify-center rounded-xl bg-[#FFF7E8] text-[#A96F12] dark:bg-warning-950"><Clock3 class="size-5" /></span><ArrowRight class="size-4 text-surface-300 transition group-hover:translate-x-0.5 group-hover:text-[#A96F12]" /></div>
          <p class="mt-5 text-3xl font-bold text-[#102A43] dark:text-white">{{ recruitment.actionPending }}</p>
          <p class="mt-1 text-sm font-semibold text-surface-700 dark:text-surface-200">Actions Pending</p>
          <p class="mt-1 text-xs text-surface-400">Open recruiter action queue</p>
        </NuxtLink>

        <div class="rounded-2xl border border-[#E8D4D4] bg-white p-5 shadow-sm dark:border-surface-800 dark:bg-surface-900">
          <span class="flex size-10 items-center justify-center rounded-xl bg-[#FDF0F0] text-[#B45454] dark:bg-danger-950"><Target class="size-5" /></span>
          <p class="mt-5 text-3xl font-bold text-[#102A43] dark:text-white">{{ recruitment.overdueRequirements }}</p>
          <p class="mt-1 text-sm font-semibold text-surface-700 dark:text-surface-200">Closure Risk</p>
          <p class="mt-1 text-xs text-surface-400">Requirements past target closure</p>
        </div>
      </section>

      <div v-if="recruitment.dueSoonRequirements || recruitment.overdueRequirements" class="flex flex-wrap items-center gap-3 rounded-2xl border border-[#E8D7B4] bg-[#FFF9EC] px-5 py-4 text-[#6F531B] dark:border-warning-900 dark:bg-warning-950/20 dark:text-warning-200">
        <AlertTriangle class="size-5 shrink-0" />
        <p class="text-sm"><strong>{{ recruitment.overdueRequirements }}</strong> overdue and <strong>{{ recruitment.dueSoonRequirements }}</strong> due within the next 7 days.</p>
        <NuxtLink :to="localePath('/dashboard/jobs')" class="ml-auto text-sm font-semibold text-[#815E15] underline underline-offset-2 dark:text-warning-200">Review requirements</NuxtLink>
      </div>

      <div v-if="isEmpty" class="rounded-3xl border border-dashed border-[#BFD6E6] bg-[#F7FBFE] px-6 py-14 text-center dark:border-surface-700 dark:bg-surface-900">
        <Sparkles class="mx-auto size-8 text-[#2E86C1]" />
        <h2 class="mt-4 text-lg font-bold text-[#102A43] dark:text-white">{{ scope.allocatedOnly ? 'No requirements allocated yet' : 'No active recruitment yet' }}</h2>
        <p class="mx-auto mt-2 max-w-lg text-sm text-surface-500">{{ scope.allocatedOnly ? 'Your dashboard will populate automatically when a requirement is allocated to you.' : 'Create a requirement to begin the PDS recruitment workflow.' }}</p>
      </div>

      <div v-else class="grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
        <section class="rounded-2xl border border-surface-200 bg-white shadow-sm dark:border-surface-800 dark:bg-surface-900">
          <div class="flex items-center justify-between border-b border-surface-100 px-5 py-4 dark:border-surface-800">
            <div><h2 class="font-bold text-[#102A43] dark:text-white">{{ scope.allocatedOnly ? 'My Requirements' : 'Active Requirements' }}</h2><p class="mt-0.5 text-xs text-surface-400">Target closure and current recruitment load</p></div>
            <NuxtLink :to="localePath('/dashboard/jobs')" class="text-sm font-semibold text-[#1F6FA3] no-underline hover:underline">View all</NuxtLink>
          </div>
          <div class="divide-y divide-surface-100 dark:divide-surface-800">
            <NuxtLink v-for="job in topJobs" :key="job.id" :to="localePath(`/dashboard/jobs/${job.id}`)" class="grid gap-3 px-5 py-4 no-underline transition hover:bg-[#F7FBFE] sm:grid-cols-[1fr_auto] dark:hover:bg-surface-800/40">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2"><p class="truncate font-semibold text-surface-900 dark:text-white">{{ job.title }}</p><span class="rounded-full bg-[#EAF4FB] px-2 py-0.5 text-[11px] font-semibold text-[#1F6FA3] dark:bg-brand-950 dark:text-brand-300">{{ job.applicationCount ?? 0 }} candidates</span></div>
                <p class="mt-1 text-xs" :class="daysTo(job.targetClosureDate) != null && daysTo(job.targetClosureDate)! < 0 ? 'text-danger-600' : daysTo(job.targetClosureDate) != null && daysTo(job.targetClosureDate)! <= 7 ? 'text-warning-700' : 'text-surface-400'">Target: {{ formatDate(job.targetClosureDate) }} · {{ closureLabel(job.targetClosureDate) }}</p>
              </div>
              <div class="flex items-center gap-4 text-xs text-surface-500"><span><strong class="text-surface-800 dark:text-surface-200">{{ job.screeningCount ?? 0 }}</strong> screening</span><span><strong class="text-surface-800 dark:text-surface-200">{{ job.interviewCount ?? 0 }}</strong> interview</span><span><strong class="text-surface-800 dark:text-surface-200">{{ job.offerCount ?? 0 }}</strong> offer</span></div>
            </NuxtLink>
            <div v-if="!topJobs.length" class="px-5 py-10 text-center text-sm text-surface-400">No open requirements in your current scope.</div>
          </div>
        </section>

        <section class="rounded-2xl border border-surface-200 bg-white shadow-sm dark:border-surface-800 dark:bg-surface-900">
          <div class="border-b border-surface-100 px-5 py-4 dark:border-surface-800"><h2 class="font-bold text-[#102A43] dark:text-white">Recent Movement</h2><p class="mt-0.5 text-xs text-surface-400">Latest candidates in your visible requirements</p></div>
          <div class="divide-y divide-surface-100 dark:divide-surface-800">
            <NuxtLink v-for="row in recentApplications.slice(0, 6)" :key="row.id" :to="localePath(`/dashboard/recruitment/${row.id}`)" class="flex items-start gap-3 px-5 py-4 no-underline hover:bg-[#F7FBFE] dark:hover:bg-surface-800/40">
              <span class="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-[#E9F8F6] text-[#16847F] dark:bg-accent-950"><UserRoundCheck class="size-4" /></span>
              <div class="min-w-0 flex-1"><div class="flex items-start justify-between gap-2"><p class="truncate text-sm font-semibold text-surface-900 dark:text-white">{{ candidateName(row) }}</p><span v-if="row.priority" class="rounded-full bg-[#102A43] px-2 py-0.5 text-[10px] font-bold text-white">{{ row.priority }}</span></div><p class="mt-0.5 truncate text-xs text-surface-500">{{ row.jobTitle }}</p><p class="mt-1 text-[11px] font-medium text-[#1F6FA3]">{{ stageLabel(row.recruitmentStatus) }}</p><p v-if="row.nextAction" class="mt-1 line-clamp-2 text-[11px] text-surface-400">{{ row.nextAction }}</p></div>
            </NuxtLink>
            <div v-if="!recentApplications.length" class="px-5 py-10 text-center text-sm text-surface-400">No candidate movement yet.</div>
          </div>
        </section>
      </div>

      <section class="grid gap-4 sm:grid-cols-3">
        <NuxtLink :to="localePath('/dashboard/jobs')" class="flex items-center gap-3 rounded-2xl border border-surface-200 bg-white p-4 no-underline hover:border-[#82B8D8] dark:border-surface-800 dark:bg-surface-900"><span class="flex size-10 items-center justify-center rounded-xl bg-[#EAF4FB] text-[#1F6FA3]"><BriefcaseBusiness class="size-5" /></span><div><p class="text-sm font-semibold text-surface-900 dark:text-white">Requirements</p><p class="text-xs text-surface-400">Open JD and recruitment workspaces</p></div></NuxtLink>
        <NuxtLink to="/dashboard/pds-candidates" class="flex items-center gap-3 rounded-2xl border border-surface-200 bg-white p-4 no-underline hover:border-[#7FC5C1] dark:border-surface-800 dark:bg-surface-900"><span class="flex size-10 items-center justify-center rounded-xl bg-[#E9F8F6] text-[#16847F]"><Database class="size-5" /></span><div><p class="text-sm font-semibold text-surface-900 dark:text-white">Candidate Database</p><p class="text-xs text-surface-400">Search the central PDS talent database</p></div></NuxtLink>
        <div class="flex items-center gap-3 rounded-2xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900"><span class="flex size-10 items-center justify-center rounded-xl bg-[#EDF3F7] text-[#486581]"><CheckCircle2 class="size-5" /></span><div><p class="text-sm font-semibold text-surface-900 dark:text-white">{{ counts.totalApplications }}</p><p class="text-xs text-surface-400">Total candidates moved into recruitment</p></div></div>
      </section>
    </template>
  </div>
</template>
