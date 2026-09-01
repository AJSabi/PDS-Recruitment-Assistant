<script setup lang="ts">
import {
  AlertTriangle,
  BarChart3,
  BriefcaseBusiness,
  Clock3,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Target,
  UserRoundCheck,
  UsersRound,
} from '@lucide/vue'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'require-org'] })
useSeoMeta({ title: 'Management Analytics', description: 'PDS recruitment management analytics' })

const localePath = useLocalePath()
const { summary, ageing, stageFunnel, historicalConversions, sourceEffectiveness, recruiters, requirements, limitations, status, error, refresh } = useManagementAnalytics()

const ageingRows = computed(() => [
  { label: '0–30 days', value: ageing.value.days0To30 },
  { label: '31–45 days', value: ageing.value.days31To45 },
  { label: '46–60 days', value: ageing.value.days46To60 },
  { label: '61+ days', value: ageing.value.days61Plus },
  { label: 'TAT not started', value: ageing.value.tatNotStarted },
])

const maxStageCount = computed(() => Math.max(1, ...stageFunnel.value.map((row: any) => Number(row.count ?? 0))))
const riskRequirements = computed(() => requirements.value.filter((row: any) => row.overdue || row.dueSoon).slice(0, 10))

function formatDate(value?: string | Date | null) {
  if (!value) return 'Not set'
  return new Date(value).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

function rate(value?: number | null) {
  return value == null ? '—' : `${value}%`
}
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-6">
    <div v-if="status === 'pending'" class="flex min-h-[55vh] items-center justify-center">
      <div class="text-center">
        <Loader2 class="mx-auto size-7 animate-spin text-brand-600" />
        <p class="mt-3 text-sm text-surface-500">Loading management analytics…</p>
      </div>
    </div>

    <div v-else-if="error" class="rounded-2xl border border-danger-200 bg-danger-50 p-6 dark:border-danger-900 dark:bg-danger-950/30">
      <div class="flex items-start gap-3">
        <ShieldAlert class="mt-0.5 size-5 text-danger-600" />
        <div>
          <h1 class="font-bold text-danger-900 dark:text-danger-100">Management analytics unavailable</h1>
          <p class="mt-1 text-sm text-danger-700 dark:text-danger-300">This view is restricted to recruitment administrators and owners.</p>
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
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-[#9FD3F2]">Management Dashboard</p>
            <h1 class="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Recruitment Analytics</h1>
            <p class="mt-2 max-w-3xl text-sm leading-6 text-[#D5E6F3]">Organisation-wide visibility across requirement ageing, recruiter workload, candidate movement, source effectiveness, governed conversion and closure risk.</p>
          </div>
          <button class="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/15" @click="refresh">
            <RefreshCw class="size-4" />Refresh
          </button>
        </div>
      </section>

      <section class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div class="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm dark:border-surface-800 dark:bg-surface-900">
          <BriefcaseBusiness class="size-5 text-[#1F6FA3]" />
          <p class="mt-4 text-3xl font-bold text-[#102A43] dark:text-white">{{ summary.openRequirements }}</p>
          <p class="mt-1 text-sm font-semibold text-surface-700 dark:text-surface-200">Open Requirements</p>
          <p class="mt-1 text-xs text-surface-400">{{ summary.unallocatedRequirements }} unallocated</p>
        </div>
        <div class="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm dark:border-surface-800 dark:bg-surface-900">
          <UsersRound class="size-5 text-[#16847F]" />
          <p class="mt-4 text-3xl font-bold text-[#102A43] dark:text-white">{{ summary.activeCandidates }}</p>
          <p class="mt-1 text-sm font-semibold text-surface-700 dark:text-surface-200">Active Candidates</p>
          <p class="mt-1 text-xs text-surface-400">{{ summary.profilesSourced }} profiles sourced</p>
        </div>
        <div class="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm dark:border-surface-800 dark:bg-surface-900">
          <UserRoundCheck class="size-5 text-[#7A5CA8]" />
          <p class="mt-4 text-3xl font-bold text-[#102A43] dark:text-white">{{ summary.screensCompleted }}</p>
          <p class="mt-1 text-sm font-semibold text-surface-700 dark:text-surface-200">Screens Completed</p>
          <p class="mt-1 text-xs text-surface-400">Completed governed recruiter sessions</p>
        </div>
        <div class="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm dark:border-surface-800 dark:bg-surface-900">
          <Clock3 class="size-5 text-[#A96F12]" />
          <p class="mt-4 text-3xl font-bold text-[#102A43] dark:text-white">{{ summary.averageOpenDays }}</p>
          <p class="mt-1 text-sm font-semibold text-surface-700 dark:text-surface-200">Average Open Days</p>
          <p class="mt-1 text-xs text-surface-400">From recruiter assignment date only</p>
        </div>
      </section>

      <section class="grid gap-6 xl:grid-cols-2">
        <div class="rounded-2xl border border-surface-200 bg-white shadow-sm dark:border-surface-800 dark:bg-surface-900">
          <div class="border-b border-surface-100 px-5 py-4 dark:border-surface-800">
            <h2 class="font-bold text-[#102A43] dark:text-white">Requirement Ageing</h2>
            <p class="mt-0.5 text-xs text-surface-400">TAT begins only when a recruiter is assigned.</p>
          </div>
          <div class="grid gap-3 p-5 sm:grid-cols-5">
            <div v-for="row in ageingRows" :key="row.label" class="rounded-xl bg-[#F7FBFE] p-4 text-center dark:bg-surface-800/50">
              <p class="text-2xl font-bold text-[#102A43] dark:text-white">{{ row.value }}</p>
              <p class="mt-1 text-xs font-medium text-surface-500">{{ row.label }}</p>
            </div>
          </div>
        </div>

        <div class="rounded-2xl border border-surface-200 bg-white shadow-sm dark:border-surface-800 dark:bg-surface-900">
          <div class="border-b border-surface-100 px-5 py-4 dark:border-surface-800">
            <h2 class="font-bold text-[#102A43] dark:text-white">Current Stage Snapshot</h2>
            <p class="mt-0.5 text-xs text-surface-400">Current candidate distribution; not a historical conversion funnel.</p>
          </div>
          <div class="space-y-3 p-5">
            <div v-for="row in stageFunnel" :key="row.key" class="grid grid-cols-[140px_1fr_40px] items-center gap-3 text-sm">
              <span class="truncate text-surface-600 dark:text-surface-300">{{ row.label }}</span>
              <div class="h-2 overflow-hidden rounded-full bg-surface-100 dark:bg-surface-800"><div class="h-full rounded-full bg-[#2E86C1]" :style="{ width: `${Math.max(3, (row.count / maxStageCount) * 100)}%` }" /></div>
              <strong class="text-right text-[#102A43] dark:text-white">{{ row.count }}</strong>
            </div>
          </div>
        </div>
      </section>

      <section class="rounded-2xl border border-surface-200 bg-white shadow-sm dark:border-surface-800 dark:bg-surface-900">
        <div class="border-b border-surface-100 px-5 py-4 dark:border-surface-800">
          <h2 class="font-bold text-[#102A43] dark:text-white">Governed Conversion Metrics</h2>
          <p class="mt-0.5 text-xs text-surface-400">Only stage-change events recorded from {{ formatDate(historicalConversions.telemetryStartAt) }} are included. Earlier incomplete history is excluded.</p>
        </div>
        <div class="grid gap-4 p-5 md:grid-cols-3">
          <div v-for="metric in historicalConversions.metrics" :key="metric.key" class="rounded-xl border border-surface-100 bg-[#F7FBFE] p-4 dark:border-surface-800 dark:bg-surface-800/40">
            <p class="text-sm font-semibold text-surface-600 dark:text-surface-300">{{ metric.label }}</p>
            <p class="mt-2 text-3xl font-bold text-[#102A43] dark:text-white">{{ metric.rate == null ? '—' : `${metric.rate}%` }}</p>
            <p class="mt-2 text-xs text-surface-500">{{ metric.numerator }} {{ metric.numeratorLabel }} / {{ metric.denominator }} {{ metric.denominatorLabel }}</p>
          </div>
        </div>
        <div v-if="historicalConversions.observedApplications === 0" class="border-t border-surface-100 px-5 py-4 text-xs text-surface-500 dark:border-surface-800">
          No post-baseline stage events have accumulated yet. Conversion rates will populate as governed recruitment movements are recorded.
        </div>
      </section>

      <section class="rounded-2xl border border-surface-200 bg-white shadow-sm dark:border-surface-800 dark:bg-surface-900">
        <div class="border-b border-surface-100 px-5 py-4 dark:border-surface-800">
          <h2 class="font-bold text-[#102A43] dark:text-white">Source Effectiveness</h2>
          <p class="mt-0.5 text-xs text-surface-400">Applications attributed through the governed source taxonomy from {{ formatDate(sourceEffectiveness.telemetryStartAt) }} onward.</p>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[950px] text-left text-sm">
            <thead class="bg-[#F7FBFE] text-xs uppercase tracking-wide text-surface-500 dark:bg-surface-800/50"><tr><th class="px-5 py-3">Source</th><th class="px-4 py-3 text-right">Profiles</th><th class="px-4 py-3 text-right">Screened</th><th class="px-4 py-3 text-right">Interview</th><th class="px-4 py-3 text-right">Offer</th><th class="px-4 py-3 text-right">Joined</th><th class="px-4 py-3 text-right">Screen Rate</th><th class="px-4 py-3 text-right">Interview Rate</th><th class="px-4 py-3 text-right">Offer Rate</th><th class="px-5 py-3 text-right">Join Rate</th></tr></thead>
            <tbody class="divide-y divide-surface-100 dark:divide-surface-800">
              <tr v-for="row in sourceEffectiveness.rows" :key="row.key" class="text-surface-700 dark:text-surface-300">
                <td class="px-5 py-3.5 font-semibold text-[#102A43] dark:text-white">{{ row.label }}</td><td class="px-4 py-3.5 text-right">{{ row.profiles }}</td><td class="px-4 py-3.5 text-right">{{ row.screened }}</td><td class="px-4 py-3.5 text-right">{{ row.interviews }}</td><td class="px-4 py-3.5 text-right">{{ row.offers }}</td><td class="px-4 py-3.5 text-right">{{ row.joined }}</td><td class="px-4 py-3.5 text-right">{{ rate(row.screeningRate) }}</td><td class="px-4 py-3.5 text-right">{{ rate(row.interviewRate) }}</td><td class="px-4 py-3.5 text-right">{{ rate(row.offerRate) }}</td><td class="px-5 py-3.5 text-right">{{ rate(row.joiningRate) }}</td>
              </tr>
              <tr v-if="!sourceEffectiveness.rows.length"><td colspan="10" class="px-5 py-10 text-center text-surface-400">No post-baseline attributed applications yet.</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="rounded-2xl border border-surface-200 bg-white shadow-sm dark:border-surface-800 dark:bg-surface-900">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-surface-100 px-5 py-4 dark:border-surface-800">
          <div><h2 class="font-bold text-[#102A43] dark:text-white">Recruiter Workload & Productivity</h2><p class="mt-0.5 text-xs text-surface-400">Open requirements, sourced profiles, completed screens and active candidate load.</p></div>
          <BarChart3 class="size-5 text-[#2E86C1]" />
        </div>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[850px] text-left text-sm">
            <thead class="bg-[#F7FBFE] text-xs uppercase tracking-wide text-surface-500 dark:bg-surface-800/50"><tr><th class="px-5 py-3">Recruiter</th><th class="px-4 py-3 text-right">Open Reqs</th><th class="px-4 py-3 text-right">Profiles</th><th class="px-4 py-3 text-right">Screens</th><th class="px-4 py-3 text-right">Active Candidates</th><th class="px-4 py-3 text-right">Avg Open Days</th><th class="px-5 py-3 text-right">Overdue</th></tr></thead>
            <tbody class="divide-y divide-surface-100 dark:divide-surface-800">
              <tr v-for="row in recruiters" :key="row.recruiterId ?? 'unallocated'" class="text-surface-700 dark:text-surface-300">
                <td class="px-5 py-3.5 font-semibold text-[#102A43] dark:text-white">{{ row.recruiterName }}</td><td class="px-4 py-3.5 text-right">{{ row.openRequirements }}</td><td class="px-4 py-3.5 text-right">{{ row.profilesSourced }}</td><td class="px-4 py-3.5 text-right">{{ row.screensCompleted }}</td><td class="px-4 py-3.5 text-right">{{ row.activeCandidates }}</td><td class="px-4 py-3.5 text-right">{{ row.averageOpenDays ?? '—' }}</td><td class="px-5 py-3.5 text-right" :class="row.overdueRequirements ? 'font-semibold text-danger-600' : ''">{{ row.overdueRequirements }}</td>
              </tr>
              <tr v-if="!recruiters.length"><td colspan="7" class="px-5 py-10 text-center text-surface-400">No open requirements.</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="rounded-2xl border border-surface-200 bg-white shadow-sm dark:border-surface-800 dark:bg-surface-900">
        <div class="flex items-center justify-between border-b border-surface-100 px-5 py-4 dark:border-surface-800">
          <div><h2 class="font-bold text-[#102A43] dark:text-white">Target Closure Risk</h2><p class="mt-0.5 text-xs text-surface-400">{{ summary.overdueRequirements }} overdue · {{ summary.dueSoonRequirements }} due in the next 7 days</p></div><Target class="size-5 text-[#B45454]" />
        </div>
        <div v-if="riskRequirements.length" class="divide-y divide-surface-100 dark:divide-surface-800">
          <NuxtLink v-for="row in riskRequirements" :key="row.jobId" :to="localePath(`/dashboard/jobs/${row.jobId}`)" class="grid gap-3 px-5 py-4 no-underline hover:bg-[#F7FBFE] sm:grid-cols-[1fr_auto] dark:hover:bg-surface-800/40">
            <div><div class="flex items-center gap-2"><AlertTriangle class="size-4" :class="row.overdue ? 'text-danger-600' : 'text-warning-600'" /><p class="font-semibold text-[#102A43] dark:text-white">{{ row.title }}</p></div><p class="mt-1 text-xs text-surface-500">{{ row.recruiterName }} · Assigned {{ formatDate(row.assignmentDate) }} · Target {{ formatDate(row.targetClosureDate) }}</p></div>
            <div class="text-right"><p class="text-sm font-semibold" :class="row.overdue ? 'text-danger-600' : 'text-warning-700'">{{ row.overdue ? 'Overdue' : 'Due soon' }}</p><p class="mt-1 text-xs text-surface-400">{{ row.openDays == null ? 'TAT not started' : `${row.openDays} days open` }}</p></div>
          </NuxtLink>
        </div>
        <div v-else class="px-5 py-10 text-center text-sm text-surface-400">No requirements are currently overdue or due within 7 days.</div>
      </section>

      <section class="rounded-2xl border border-[#D9E6EF] bg-[#F7FBFE] p-5 dark:border-surface-800 dark:bg-surface-900">
        <h2 class="text-sm font-bold text-[#102A43] dark:text-white">Analytics coverage</h2>
        <p class="mt-2 text-xs leading-5 text-surface-500">This dashboard reports only metrics supported by governed persisted data. {{ limitations.sourceEffectiveness }} {{ limitations.historicalConversion }}</p>
      </section>
    </template>
  </div>
</template>
