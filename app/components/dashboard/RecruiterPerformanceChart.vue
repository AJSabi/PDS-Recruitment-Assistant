<script setup lang="ts">
import { Loader2, RefreshCw, TrendingUp } from '@lucide/vue'

const {
  period,
  recruiterId,
  scope,
  totals,
  conversions,
  trend,
  recruiters,
  status,
  error,
  refresh,
  setPeriod,
  setRecruiter,
} = useRecruiterPerformance()

const periods = [7, 30, 90] as const

const activityMetrics = computed(() => [
  { key: 'candidatesSourced', label: 'Sourced', value: totals.value.candidatesSourced },
  { key: 'recruiterScreeningsCompleted', label: 'Screened', value: totals.value.recruiterScreeningsCompleted },
  { key: 'interviewsCompleted', label: 'Interviewed', value: totals.value.interviewsCompleted },
  { key: 'offersRaised', label: 'Offers', value: totals.value.offersRaised },
  { key: 'offersAccepted', label: 'Accepted', value: totals.value.offersAccepted },
  { key: 'joined', label: 'Joined', value: totals.value.joined },
])

const conversionMetrics = computed(() => [
  { label: 'Screening → Interview', value: conversions.value.screeningToInterview },
  { label: 'Interview → Offer', value: conversions.value.interviewToOffer },
  { label: 'Offer → Acceptance', value: conversions.value.offerToAcceptance },
  { label: 'Offer → Join', value: conversions.value.offerToJoin },
])

const maxActivity = computed(() => Math.max(1, ...activityMetrics.value.map(item => Number(item.value ?? 0))))
const maxTrend = computed(() => Math.max(1, ...trend.value.map((row: any) => Number(row.candidatesSourced ?? 0) + Number(row.interviewsCompleted ?? 0) + Number(row.offersRaised ?? 0) + Number(row.joined ?? 0))))

function activityWidth(value: number) {
  return `${Math.max(value > 0 ? 6 : 0, Math.round((value / maxActivity.value) * 100))}%`
}

function trendHeight(row: any) {
  const value = Number(row.candidatesSourced ?? 0) + Number(row.interviewsCompleted ?? 0) + Number(row.offersRaised ?? 0) + Number(row.joined ?? 0)
  return `${Math.max(value > 0 ? 8 : 2, Math.round((value / maxTrend.value) * 100))}%`
}

function shortDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })
}
</script>

<template>
  <section class="overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-sm dark:border-surface-800 dark:bg-surface-900" data-testid="recruiter-performance-chart">
    <div class="flex flex-col gap-3 border-b border-surface-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between dark:border-surface-800">
      <div>
        <div class="flex items-center gap-2">
          <span class="flex size-8 items-center justify-center rounded-lg bg-[#EAF4FB] text-[#1F6FA3]"><TrendingUp class="size-4" /></span>
          <div>
            <h2 class="font-bold text-[#102A43] dark:text-white">Recruiter Performance</h2>
            <p class="text-xs text-surface-400">{{ scope.selectedRecruiterName }} · activity and conversion view</p>
          </div>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <select
          v-if="scope.canSelectRecruiter"
          :value="recruiterId ?? ''"
          class="h-9 rounded-lg border border-surface-200 bg-white px-3 text-xs font-semibold text-surface-700 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-200"
          aria-label="Recruiter"
          @change="setRecruiter(($event.target as HTMLSelectElement).value || null)"
        >
          <option value="">All Recruiters</option>
          <option v-for="recruiter in recruiters" :key="recruiter.id" :value="recruiter.id">{{ recruiter.name }}</option>
        </select>

        <div class="inline-flex rounded-lg border border-surface-200 p-0.5 dark:border-surface-700">
          <button
            v-for="value in periods"
            :key="value"
            type="button"
            class="rounded-md px-3 py-1.5 text-xs font-semibold transition"
            :class="period === value ? 'bg-[#176B87] text-white' : 'text-surface-500 hover:bg-surface-50 dark:hover:bg-surface-800'"
            @click="setPeriod(value)"
          >
            {{ value }}D
          </button>
        </div>

        <button type="button" class="inline-flex size-9 items-center justify-center rounded-lg border border-surface-200 text-surface-500 hover:bg-surface-50 dark:border-surface-700 dark:hover:bg-surface-800" aria-label="Refresh recruiter performance" @click="refresh()">
          <RefreshCw class="size-4" />
        </button>
      </div>
    </div>

    <div v-if="status === 'pending'" class="flex items-center justify-center gap-2 px-5 py-12 text-sm text-surface-400">
      <Loader2 class="size-4 animate-spin" /> Loading recruiter performance…
    </div>

    <div v-else-if="error" class="px-5 py-8 text-center text-sm text-danger-600">
      Recruiter performance could not be loaded.
    </div>

    <div v-else class="grid gap-0 xl:grid-cols-[1.15fr_.85fr]">
      <div class="border-b border-surface-100 p-5 xl:border-b-0 xl:border-r dark:border-surface-800">
        <div class="grid gap-5 md:grid-cols-[.9fr_1.1fr]">
          <div>
            <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-surface-400">Period totals</p>
            <div class="mt-4 space-y-3">
              <div v-for="item in activityMetrics" :key="item.key">
                <div class="mb-1 flex items-center justify-between text-xs">
                  <span class="font-medium text-surface-600 dark:text-surface-300">{{ item.label }}</span>
                  <span class="font-bold text-[#102A43] dark:text-white">{{ item.value }}</span>
                </div>
                <div class="h-2 overflow-hidden rounded-full bg-surface-100 dark:bg-surface-800">
                  <div class="h-full rounded-full bg-[#2B7C92] transition-all" :style="{ width: activityWidth(item.value) }" />
                </div>
              </div>
            </div>
          </div>

          <div>
            <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-surface-400">Daily movement</p>
            <div class="mt-4 flex h-44 items-end gap-1 overflow-hidden rounded-xl border border-surface-100 bg-[#F9FBFC] px-3 pb-6 pt-3 dark:border-surface-800 dark:bg-surface-950/30">
              <div v-for="(row, index) in trend" :key="row.date" class="group relative flex min-w-0 flex-1 items-end justify-center self-stretch">
                <div class="w-full max-w-3 rounded-t bg-[#6FA8B8] transition-all group-hover:bg-[#2B7C92]" :style="{ height: trendHeight(row) }" />
                <span v-if="trend.length <= 14 || index % Math.ceil(trend.length / 7) === 0" class="absolute -bottom-5 whitespace-nowrap text-[9px] text-surface-400">{{ shortDate(row.date) }}</span>
              </div>
            </div>
            <p class="mt-2 text-[10px] text-surface-400">Daily bar combines sourced, interviews completed, offers raised and joins for a quick activity trend.</p>
          </div>
        </div>
      </div>

      <div class="p-5">
        <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-surface-400">Conversion</p>
        <div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <div v-for="item in conversionMetrics" :key="item.label" class="rounded-xl border border-surface-100 bg-[#F9FBFC] p-3 dark:border-surface-800 dark:bg-surface-950/30">
            <div class="flex items-end justify-between gap-3">
              <p class="text-xs font-medium text-surface-600 dark:text-surface-300">{{ item.label }}</p>
              <p class="text-xl font-bold text-[#102A43] dark:text-white">{{ item.value }}%</p>
            </div>
            <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-100 dark:bg-surface-800">
              <div class="h-full rounded-full bg-[#39784A]" :style="{ width: `${Math.min(100, Math.max(0, Number(item.value ?? 0)))}%` }" />
            </div>
          </div>
        </div>
        <p class="mt-4 text-[10px] leading-4 text-surface-400">Recruiters see only their own performance. TA Lead and Management can view the team or select a recruiter. This view is descriptive and does not rank recruiters.</p>
      </div>
    </div>
  </section>
</template>
