<script setup lang="ts">
import {
  AlertTriangle,
  BriefcaseBusiness,
  CalendarClock,
  Clock3,
  Loader2,
  RefreshCw,
  ShieldAlert,
  UserRoundCheck,
  UsersRound,
} from '@lucide/vue'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'require-org'] })
useSeoMeta({ title: 'TA Operations', description: 'PDS TA Lead recruitment operations dashboard' })

const localePath = useLocalePath()
const {
  summary,
  ageing,
  recruiters,
  requirements,
  taLead,
  status,
  taLeadStatus,
  error,
  taLeadError,
  refresh,
} = useManagementAnalytics()

const teamDaily = computed<any>(() => taLead.value.team?.daily ?? {})
const teamAverage = computed<any>(() => taLead.value.team?.average ?? {})
const loading = computed(() => status.value === 'pending' || taLeadStatus.value === 'pending')
const dashboardError = computed(() => error.value || taLeadError.value)
const riskRequirements = computed(() => requirements.value.filter((row: any) => row.overdue || row.dueSoon).slice(0, 8))

const activityRows = computed(() => [
  { label: 'Candidates sourced', daily: teamDaily.value.candidatesSourced ?? 0, average: teamAverage.value.candidatesSourced ?? 0 },
  { label: 'Recruiter screenings', daily: teamDaily.value.recruiterScreeningsCompleted ?? 0, average: teamAverage.value.recruiterScreeningsCompleted ?? 0 },
  { label: 'Interview rounds scheduled', daily: teamDaily.value.interviewsScheduled ?? 0, average: teamAverage.value.interviewsScheduled ?? 0 },
  { label: 'Interview rounds completed', daily: teamDaily.value.interviewsCompleted ?? 0, average: teamAverage.value.interviewsCompleted ?? 0 },
  { label: 'Offers raised', daily: teamDaily.value.offersRaised ?? 0, average: teamAverage.value.offersRaised ?? 0 },
  { label: 'Offers accepted', daily: teamDaily.value.offersAccepted ?? 0, average: teamAverage.value.offersAccepted ?? 0 },
  { label: 'Offers declined', daily: teamDaily.value.offersDeclined ?? 0, average: teamAverage.value.offersDeclined ?? 0 },
  { label: 'Joined', daily: teamDaily.value.joined ?? 0, average: teamAverage.value.joined ?? 0 },
])

const activityByRecruiter = computed(() => new Map((taLead.value.recruiters ?? []).map((row: any) => [row.recruiterId, row])))
const recruiterRows = computed(() => recruiters.value.map((row: any) => {
  const activity: any = row.recruiterId ? activityByRecruiter.value.get(row.recruiterId) : null
  return {
    ...row,
    daily: activity?.daily ?? {},
    average: activity?.average ?? {},
  }
}))

const ageingRows = computed(() => [
  { label: '0–30 days', value: ageing.value.days0To30 },
  { label: '31–45 days', value: ageing.value.days31To45 },
  { label: '46–60 days', value: ageing.value.days46To60 },
  { label: '61+ days', value: ageing.value.days61Plus },
  { label: 'TAT not started', value: ageing.value.tatNotStarted },
])

function formatDate(value?: string | Date | null) {
  if (!value) return 'Not set'
  return new Date(value).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatPulseDate(value?: string | null) {
  if (!value) return 'Previous weekday'
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' })
}
</script>

<template>
  <div class="mx-auto max-w-[1480px] space-y-5" data-testid="ta-operations-dashboard">
    <div v-if="loading" class="flex min-h-[55vh] items-center justify-center">
      <div class="text-center">
        <Loader2 class="mx-auto size-7 animate-spin text-brand-600" />
        <p class="mt-3 text-sm text-surface-500">Loading TA operations…</p>
      </div>
    </div>

    <div v-else-if="dashboardError" class="rounded-2xl border border-danger-200 bg-danger-50 p-6 dark:border-danger-900 dark:bg-danger-950/30">
      <div class="flex items-start gap-3">
        <ShieldAlert class="mt-0.5 size-5 text-danger-600" />
        <div>
          <h1 class="font-bold text-danger-900 dark:text-danger-100">TA operations unavailable</h1>
          <p class="mt-1 text-sm text-danger-700 dark:text-danger-300">This operational team view is restricted to recruitment administrators and owners.</p>
        </div>
        <button class="ml-auto inline-flex items-center gap-2 rounded-lg border border-danger-300 px-3 py-2 text-sm font-semibold text-danger-800" @click="refresh">
          <RefreshCw class="size-4" />Retry
        </button>
      </div>
    </div>

    <template v-else>
      <section class="rounded-3xl bg-[#102A43] px-6 py-7 text-white shadow-sm sm:px-8">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-[#9FD3F2]">Talent Acquisition Operations</p>
            <h1 class="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">TA Lead Command Centre</h1>
            <p class="mt-2 max-w-3xl text-sm leading-6 text-[#D5E6F3]">Team workload, recruiter activity, requirement health and hiring movement in one operational view.</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <NuxtLink :to="localePath('/dashboard/management-analytics')" class="inline-flex items-center rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white no-underline hover:bg-white/15">Management Analytics</NuxtLink>
            <button class="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/15" @click="refresh">
              <RefreshCw class="size-4" />Refresh
            </button>
          </div>
        </div>
      </section>

      <section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-6" data-testid="ta-operations-kpis">
        <div class="rounded-2xl border border-surface-200 bg-white p-4 shadow-sm dark:border-surface-800 dark:bg-surface-900">
          <BriefcaseBusiness class="size-5 text-[#1F6FA3]" /><p class="mt-3 text-2xl font-bold text-[#102A43] dark:text-white">{{ summary.openRequirements }}</p><p class="text-sm font-semibold text-surface-700 dark:text-surface-200">Open Requisitions</p>
        </div>
        <div class="rounded-2xl border border-surface-200 bg-white p-4 shadow-sm dark:border-surface-800 dark:bg-surface-900">
          <AlertTriangle class="size-5 text-[#A96F12]" /><p class="mt-3 text-2xl font-bold text-[#102A43] dark:text-white">{{ summary.unallocatedRequirements }}</p><p class="text-sm font-semibold text-surface-700 dark:text-surface-200">Unallocated</p>
        </div>
        <div class="rounded-2xl border border-surface-200 bg-white p-4 shadow-sm dark:border-surface-800 dark:bg-surface-900">
          <Clock3 class="size-5 text-[#B45454]" /><p class="mt-3 text-2xl font-bold text-[#102A43] dark:text-white">{{ summary.overdueRequirements }}</p><p class="text-sm font-semibold text-surface-700 dark:text-surface-200">Overdue Reqs</p>
        </div>
        <div class="rounded-2xl border border-surface-200 bg-white p-4 shadow-sm dark:border-surface-800 dark:bg-surface-900">
          <UsersRound class="size-5 text-[#16847F]" /><p class="mt-3 text-2xl font-bold text-[#102A43] dark:text-white">{{ summary.activeCandidates }}</p><p class="text-sm font-semibold text-surface-700 dark:text-surface-200">Active Candidates</p>
        </div>
        <div class="rounded-2xl border border-surface-200 bg-white p-4 shadow-sm dark:border-surface-800 dark:bg-surface-900">
          <CalendarClock class="size-5 text-[#5967A8]" /><p class="mt-3 text-2xl font-bold text-[#102A43] dark:text-white">{{ teamDaily.interviewsScheduled ?? 0 }}</p><p class="text-sm font-semibold text-surface-700 dark:text-surface-200">Interviews Scheduled</p><p class="mt-1 text-xs text-surface-400">{{ formatPulseDate(taLead.date) }}</p>
        </div>
        <div class="rounded-2xl border border-surface-200 bg-white p-4 shadow-sm dark:border-surface-800 dark:bg-surface-900">
          <UserRoundCheck class="size-5 text-[#39784A]" /><p class="mt-3 text-2xl font-bold text-[#102A43] dark:text-white">{{ teamDaily.offersRaised ?? 0 }}</p><p class="text-sm font-semibold text-surface-700 dark:text-surface-200">Offers Raised</p><p class="mt-1 text-xs text-surface-400">{{ formatPulseDate(taLead.date) }}</p>
        </div>
      </section>

      <section class="rounded-2xl border border-surface-200 bg-white shadow-sm dark:border-surface-800 dark:bg-surface-900" data-testid="ta-daily-team-pulse">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-surface-100 px-5 py-4 dark:border-surface-800">
          <div>
            <h2 class="font-bold text-[#102A43] dark:text-white">Team Daily Recruitment Pulse</h2>
            <p class="mt-0.5 text-xs text-surface-400">{{ formatPulseDate(taLead.date) }} compared with rolling {{ taLead.averageWindow.days }}-day daily average.</p>
          </div>
          <span class="rounded-full bg-[#EAF4FB] px-3 py-1 text-xs font-semibold text-[#1F6FA3]">India time</span>
        </div>
        <div class="grid gap-px bg-surface-100 sm:grid-cols-2 lg:grid-cols-4 dark:bg-surface-800">
          <div v-for="row in activityRows" :key="row.label" class="bg-white p-5 dark:bg-surface-900">
            <p class="text-xs font-semibold uppercase tracking-wide text-surface-400">{{ row.label }}</p>
            <div class="mt-3 flex items-end justify-between gap-3"><div><p class="text-3xl font-bold text-[#102A43] dark:text-white">{{ row.daily }}</p><p class="text-xs text-surface-400">Previous weekday</p></div><div class="text-right"><p class="text-lg font-bold text-surface-600 dark:text-surface-300">{{ row.average }}</p><p class="text-xs text-surface-400">Daily avg</p></div></div>
          </div>
        </div>
      </section>

      <section class="rounded-2xl border border-surface-200 bg-white shadow-sm dark:border-surface-800 dark:bg-surface-900" data-testid="ta-recruiter-performance-table">
        <div class="border-b border-surface-100 px-5 py-4 dark:border-surface-800">
          <h2 class="font-bold text-[#102A43] dark:text-white">Recruiter Workload & Daily Movement</h2>
          <p class="mt-0.5 text-xs text-surface-400">Operational drill-down only. This view does not rank recruiters.</p>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[1250px] text-left text-sm">
            <thead class="bg-[#F7FBFE] text-xs uppercase tracking-wide text-surface-500 dark:bg-surface-800/50">
              <tr><th class="px-5 py-3">Recruiter</th><th class="px-3 py-3 text-right">Open Reqs</th><th class="px-3 py-3 text-right">Active Candidates</th><th class="px-3 py-3 text-right">Overdue</th><th class="px-3 py-3 text-right">Avg TAT</th><th class="px-3 py-3 text-right">Sourced</th><th class="px-3 py-3 text-right">Screens</th><th class="px-3 py-3 text-right">Interviews</th><th class="px-3 py-3 text-right">Offers</th><th class="px-5 py-3 text-right">Joined</th></tr>
            </thead>
            <tbody class="divide-y divide-surface-100 dark:divide-surface-800">
              <tr v-for="row in recruiterRows" :key="row.recruiterId ?? 'unallocated'" class="text-surface-700 dark:text-surface-300">
                <td class="px-5 py-3.5 font-semibold text-[#102A43] dark:text-white">{{ row.recruiterName }}</td><td class="px-3 py-3.5 text-right">{{ row.openRequirements }}</td><td class="px-3 py-3.5 text-right">{{ row.activeCandidates }}</td><td class="px-3 py-3.5 text-right" :class="row.overdueRequirements ? 'font-semibold text-danger-600' : ''">{{ row.overdueRequirements }}</td><td class="px-3 py-3.5 text-right">{{ row.averageOpenDays ?? '—' }}</td><td class="px-3 py-3.5 text-right">{{ row.daily.candidatesSourced ?? 0 }}</td><td class="px-3 py-3.5 text-right">{{ row.daily.recruiterScreeningsCompleted ?? 0 }}</td><td class="px-3 py-3.5 text-right">{{ row.daily.interviewsCompleted ?? 0 }}</td><td class="px-3 py-3.5 text-right">{{ row.daily.offersRaised ?? 0 }}</td><td class="px-5 py-3.5 text-right">{{ row.daily.joined ?? 0 }}</td>
              </tr>
              <tr v-if="!recruiterRows.length"><td colspan="10" class="px-5 py-10 text-center text-surface-400">No active recruiter workload.</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="grid gap-5 xl:grid-cols-[1fr_1.35fr]">
        <div class="rounded-2xl border border-surface-200 bg-white shadow-sm dark:border-surface-800 dark:bg-surface-900">
          <div class="border-b border-surface-100 px-5 py-4 dark:border-surface-800"><h2 class="font-bold text-[#102A43] dark:text-white">Requisition Ageing</h2><p class="mt-0.5 text-xs text-surface-400">TAT begins from recruiter allocation only.</p></div>
          <div class="grid gap-3 p-5 sm:grid-cols-5 xl:grid-cols-1">
            <div v-for="row in ageingRows" :key="row.label" class="flex items-center justify-between rounded-xl bg-[#F7FBFE] px-4 py-3 dark:bg-surface-800/50"><span class="text-sm text-surface-500">{{ row.label }}</span><strong class="text-xl text-[#102A43] dark:text-white">{{ row.value }}</strong></div>
          </div>
        </div>
        <div class="rounded-2xl border border-surface-200 bg-white shadow-sm dark:border-surface-800 dark:bg-surface-900">
          <div class="border-b border-surface-100 px-5 py-4 dark:border-surface-800"><h2 class="font-bold text-[#102A43] dark:text-white">Priority Requisitions</h2><p class="mt-0.5 text-xs text-surface-400">Overdue and due within seven days.</p></div>
          <div v-if="riskRequirements.length" class="divide-y divide-surface-100 dark:divide-surface-800">
            <NuxtLink v-for="row in riskRequirements" :key="row.jobId" :to="localePath(`/dashboard/jobs/${row.jobId}`)" class="flex items-center justify-between gap-4 px-5 py-3.5 no-underline hover:bg-[#F7FBFE] dark:hover:bg-surface-800/40"><div><p class="font-semibold text-[#102A43] dark:text-white">{{ row.title }}</p><p class="mt-1 text-xs text-surface-500">{{ row.recruiterName }} · Target {{ formatDate(row.targetClosureDate) }}</p></div><div class="text-right"><p class="text-sm font-semibold" :class="row.overdue ? 'text-danger-600' : 'text-warning-700'">{{ row.overdue ? 'Overdue' : 'Due soon' }}</p><p class="text-xs text-surface-400">{{ row.openDays == null ? 'TAT not started' : `${row.openDays} days` }}</p></div></NuxtLink>
          </div>
          <div v-else class="px-5 py-10 text-center text-sm text-surface-400">No priority requisitions currently require TAT attention.</div>
        </div>
      </section>

      <section class="rounded-2xl border border-[#D9E6EF] bg-[#F7FBFE] p-5 dark:border-surface-800 dark:bg-surface-900">
        <p class="text-xs leading-5 text-surface-500">{{ taLead.attributionNote }} {{ taLead.scopeNote }}</p>
      </section>
    </template>
  </div>
</template>
