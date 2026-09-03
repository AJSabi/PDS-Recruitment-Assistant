<script setup lang="ts">
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  CalendarClock,
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
} from '@lucide/vue'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'require-org'] })
useSeoMeta({ title: 'Recruitment Command Centre', description: 'PDS recruitment command centre' })

const localePath = useLocalePath()
const { activeOrg } = useCurrentOrg()
const {
  counts,
  pipeline,
  recentApplications,
  topJobs,
  recruitment,
  scope,
  fetchStatus,
  error,
  refresh,
} = useDashboard()

const { data: recruiterKpiData, status: recruiterKpiStatus } = useFetch('/api/dashboard/recruiter-daily-kpis', {
  key: 'recruiter-daily-kpis',
  headers: useRequestHeaders(['cookie']),
})

const canCreateRequirement = computed(() => ['owner', 'admin'].includes(scope.value.role))
const canSeeManagementAnalytics = computed(() => ['owner', 'admin'].includes(scope.value.role))
const scopeLabel = computed(() => scope.value.allocatedOnly ? 'My Recruitment Command Centre' : 'Recruitment Command Centre')
const scopeDescription = computed(() => scope.value.allocatedOnly
  ? 'Your allocated requirements, candidate movement and priority actions in one operational view.'
  : `Organisation-wide hiring health, pipeline movement and recruitment priorities for ${activeOrg.value?.name ?? 'PDS'}.`)

const activePipeline = computed(() => (pipeline.value.new ?? 0) + (pipeline.value.screening ?? 0) + (pipeline.value.interview ?? 0) + (pipeline.value.offer ?? 0))
const terminalPipeline = computed(() => (pipeline.value.hired ?? 0) + (pipeline.value.rejected ?? 0))
const pipelineTotal = computed(() => activePipeline.value + terminalPipeline.value)
const riskTotal = computed(() => recruitment.value.overdueRequirements + recruitment.value.dueSoonRequirements)
const requirementsOnTrack = computed(() => Math.max(0, counts.value.openJobs - riskTotal.value))
const pipelineStages = computed(() => [
  { key: 'new', label: 'New / Sourced', value: pipeline.value.new ?? 0 },
  { key: 'screening', label: 'Screening', value: pipeline.value.screening ?? 0 },
  { key: 'interview', label: 'Interview', value: pipeline.value.interview ?? 0 },
  { key: 'offer', label: 'Offer', value: pipeline.value.offer ?? 0 },
  { key: 'hired', label: 'Hired', value: pipeline.value.hired ?? 0 },
])

const emptyRecruiterKpis = {
  candidatesSourced: 0,
  recruiterScreeningsCompleted: 0,
  interviewsScheduled: 0,
  interviewsCompleted: 0,
  hiringManagerCompleted: 0,
  hodCompleted: 0,
  hrCompleted: 0,
  offersRaised: 0,
  offersAccepted: 0,
  offersDeclined: 0,
  joined: 0,
}
const recruiterDaily = computed(() => recruiterKpiData.value?.daily ?? emptyRecruiterKpis)
const recruiterAverage = computed(() => recruiterKpiData.value?.average ?? emptyRecruiterKpis)
const recruiterKpiGroups = computed(() => [
  {
    title: 'Sourcing & Screening',
    description: 'Top-of-funnel activity completed by you',
    items: [
      { label: 'Candidates sourced', daily: recruiterDaily.value.candidatesSourced, average: recruiterAverage.value.candidatesSourced },
      { label: 'Recruiter screenings', daily: recruiterDaily.value.recruiterScreeningsCompleted, average: recruiterAverage.value.recruiterScreeningsCompleted },
    ],
  },
  {
    title: 'Interview Movement',
    description: 'Candidate movement through interview rounds',
    items: [
      { label: 'Rounds scheduled', daily: recruiterDaily.value.interviewsScheduled, average: recruiterAverage.value.interviewsScheduled },
      { label: 'Rounds completed', daily: recruiterDaily.value.interviewsCompleted, average: recruiterAverage.value.interviewsCompleted },
      { label: 'Hiring Manager', daily: recruiterDaily.value.hiringManagerCompleted, average: recruiterAverage.value.hiringManagerCompleted },
      { label: 'HOD / HR', daily: recruiterDaily.value.hodCompleted + recruiterDaily.value.hrCompleted, average: Number((recruiterAverage.value.hodCompleted + recruiterAverage.value.hrCompleted).toFixed(1)) },
    ],
  },
  {
    title: 'Offer & Joining Movement',
    description: 'Late-stage recruitment outcomes progressed by you',
    items: [
      { label: 'Offers raised', daily: recruiterDaily.value.offersRaised, average: recruiterAverage.value.offersRaised },
      { label: 'Offers accepted', daily: recruiterDaily.value.offersAccepted, average: recruiterAverage.value.offersAccepted },
      { label: 'Offers declined', daily: recruiterDaily.value.offersDeclined, average: recruiterAverage.value.offersDeclined },
      { label: 'Joined', daily: recruiterDaily.value.joined, average: recruiterAverage.value.joined },
    ],
  },
])

function pipelineWidth(value: number) {
  if (!pipelineTotal.value || value <= 0) return '0%'
  return `${Math.max(5, Math.round((value / pipelineTotal.value) * 100))}%`
}

function formatDate(value?: string | Date | null) {
  if (!value) return 'Not set'
  return new Date(value).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatKpiDate(value?: string | null) {
  if (!value) return 'Previous working day'
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' })
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

function tatLabel(job: any) {
  if (!job.assignmentDate || job.openDays == null) return 'TAT not started'
  return `${job.openDays} day${Number(job.openDays) === 1 ? '' : 's'} in TAT`
}

const isEmpty = computed(() => counts.value.openJobs === 0 && counts.value.totalApplications === 0)
</script>

<template>
  <div class="mx-auto max-w-[1440px] space-y-5" data-testid="recruitment-command-centre">
    <div v-if="fetchStatus === 'pending'" class="flex min-h-[55vh] items-center justify-center">
      <div class="text-center">
        <Loader2 class="mx-auto size-7 animate-spin text-brand-600" />
        <p class="mt-3 text-sm text-surface-500">Loading recruitment command centre…</p>
      </div>
    </div>

    <div v-else-if="error" class="rounded-2xl border border-danger-200 bg-danger-50 p-5 text-danger-800 dark:border-danger-900 dark:bg-danger-950/30 dark:text-danger-200">
      <div class="flex items-center gap-3">
        <AlertTriangle class="size-5" />
        <div><p class="font-semibold">Recruitment dashboard could not be loaded</p><p class="text-sm opacity-80">Please retry the request.</p></div>
        <button class="ml-auto inline-flex items-center gap-2 rounded-lg border border-danger-300 px-3 py-2 text-sm font-semibold" @click="refresh"><RefreshCw class="size-4" />Retry</button>
      </div>
    </div>

    <template v-else>
      <section class="flex flex-col gap-5 rounded-2xl border border-surface-200 bg-white px-5 py-5 shadow-sm md:flex-row md:items-center md:justify-between dark:border-surface-800 dark:bg-surface-900">
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <span class="rounded-full bg-[#EAF4FB] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#1F6FA3] dark:bg-brand-950/50 dark:text-brand-300">Recruitment Operations</span>
            <span class="rounded-full border border-surface-200 px-2.5 py-1 text-[11px] font-semibold text-surface-500 dark:border-surface-700 dark:text-surface-400">{{ scope.allocatedOnly ? 'Recruiter view' : 'TA / Management view' }}</span>
          </div>
          <h1 class="mt-3 text-2xl font-bold tracking-tight text-[#102A43] sm:text-3xl dark:text-white">{{ scopeLabel }}</h1>
          <p class="mt-1.5 max-w-3xl text-sm leading-6 text-surface-500">{{ scopeDescription }}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <NuxtLink :to="localePath('/dashboard/pds-candidates')" class="inline-flex items-center gap-2 rounded-xl border border-surface-200 bg-white px-4 py-2.5 text-sm font-semibold text-surface-700 no-underline hover:bg-surface-50 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-200 dark:hover:bg-surface-800"><Database class="size-4" />Candidate Database</NuxtLink>
          <NuxtLink v-if="canSeeManagementAnalytics" :to="localePath('/dashboard/management-analytics')" class="inline-flex items-center gap-2 rounded-xl border border-[#BFD6E6] bg-[#F7FBFE] px-4 py-2.5 text-sm font-semibold text-[#1F6FA3] no-underline hover:bg-[#EAF4FB] dark:border-brand-900 dark:bg-brand-950/20 dark:text-brand-300"><Target class="size-4" />Recruitment Analytics</NuxtLink>
          <NuxtLink v-if="canCreateRequirement" :to="localePath('/dashboard/jobs/new')" class="inline-flex items-center gap-2 rounded-xl bg-[#176B87] px-4 py-2.5 text-sm font-semibold text-white no-underline shadow-sm hover:bg-[#125970]"><Plus class="size-4" />New Requirement</NuxtLink>
        </div>
      </section>

      <section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-6" data-testid="recruitment-kpi-strip">
        <NuxtLink :to="localePath('/dashboard/jobs')" class="rounded-2xl border border-surface-200 bg-white p-4 no-underline shadow-sm transition hover:border-[#8BB8C8] hover:shadow-md dark:border-surface-800 dark:bg-surface-900">
          <span class="flex size-9 items-center justify-center rounded-xl bg-[#E9F4F7] text-[#176B87]"><BriefcaseBusiness class="size-4.5" /></span>
          <p class="mt-4 text-2xl font-bold text-[#102A43] dark:text-white">{{ counts.openJobs }}</p><p class="text-sm font-semibold text-surface-700 dark:text-surface-200">Active Requisitions</p><p class="mt-1 text-xs text-surface-400">{{ scope.allocatedOnly ? 'Allocated to me' : 'Organisation-wide' }}</p>
        </NuxtLink>
        <NuxtLink :to="localePath('/dashboard/closure-risk')" class="rounded-2xl border border-surface-200 bg-white p-4 no-underline shadow-sm transition hover:border-[#D6B26A] hover:shadow-md dark:border-surface-800 dark:bg-surface-900">
          <span class="flex size-9 items-center justify-center rounded-xl bg-[#FFF6E5] text-[#9A6A10]"><AlertTriangle class="size-4.5" /></span>
          <p class="mt-4 text-2xl font-bold text-[#102A43] dark:text-white">{{ riskTotal }}</p><p class="text-sm font-semibold text-surface-700 dark:text-surface-200">Need Attention</p><p class="mt-1 text-xs text-surface-400">Overdue + due in 7 days</p>
        </NuxtLink>
        <NuxtLink :to="localePath('/dashboard/active-candidates')" class="rounded-2xl border border-surface-200 bg-white p-4 no-underline shadow-sm transition hover:border-[#83BDB6] hover:shadow-md dark:border-surface-800 dark:bg-surface-900">
          <span class="flex size-9 items-center justify-center rounded-xl bg-[#EAF7F5] text-[#187C73]"><UsersRound class="size-4.5" /></span>
          <p class="mt-4 text-2xl font-bold text-[#102A43] dark:text-white">{{ counts.totalCandidates }}</p><p class="text-sm font-semibold text-surface-700 dark:text-surface-200">Active Candidates</p><p class="mt-1 text-xs text-surface-400">Across active requirements</p>
        </NuxtLink>
        <NuxtLink :to="localePath('/dashboard/actions')" class="rounded-2xl border border-surface-200 bg-white p-4 no-underline shadow-sm transition hover:border-[#A8A7D8] hover:shadow-md dark:border-surface-800 dark:bg-surface-900">
          <span class="flex size-9 items-center justify-center rounded-xl bg-[#F1F0FB] text-[#5F5AA8]"><Clock3 class="size-4.5" /></span>
          <p class="mt-4 text-2xl font-bold text-[#102A43] dark:text-white">{{ recruitment.actionPending }}</p><p class="text-sm font-semibold text-surface-700 dark:text-surface-200">Actions Pending</p><p class="mt-1 text-xs text-surface-400">Candidate follow-ups</p>
        </NuxtLink>
        <div class="rounded-2xl border border-surface-200 bg-white p-4 shadow-sm dark:border-surface-800 dark:bg-surface-900">
          <span class="flex size-9 items-center justify-center rounded-xl bg-[#EEF5FC] text-[#3D6D9A]"><CalendarClock class="size-4.5" /></span>
          <p class="mt-4 text-2xl font-bold text-[#102A43] dark:text-white">{{ pipeline.interview ?? 0 }}</p><p class="text-sm font-semibold text-surface-700 dark:text-surface-200">In Interview</p><p class="mt-1 text-xs text-surface-400">Current pipeline stage</p>
        </div>
        <div class="rounded-2xl border border-surface-200 bg-white p-4 shadow-sm dark:border-surface-800 dark:bg-surface-900">
          <span class="flex size-9 items-center justify-center rounded-xl bg-[#EDF7EF] text-[#39784A]"><UserRoundCheck class="size-4.5" /></span>
          <p class="mt-4 text-2xl font-bold text-[#102A43] dark:text-white">{{ pipeline.offer ?? 0 }}</p><p class="text-sm font-semibold text-surface-700 dark:text-surface-200">Offers in Process</p><p class="mt-1 text-xs text-surface-400">Current offer stage</p>
        </div>
      </section>

      <section v-if="scope.allocatedOnly" class="overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-sm dark:border-surface-800 dark:bg-surface-900" data-testid="recruiter-daily-performance-pulse">
        <div class="flex flex-col gap-2 border-b border-surface-100 px-5 py-4 sm:flex-row sm:items-end sm:justify-between dark:border-surface-800">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="font-bold text-[#102A43] dark:text-white">My Daily Recruitment Pulse</h2>
              <span class="rounded-full bg-[#EAF4FB] px-2 py-0.5 text-[10px] font-semibold text-[#1F6FA3]">{{ formatKpiDate(recruiterKpiData?.date) }}</span>
            </div>
            <p class="mt-1 text-xs text-surface-400">Previous working day activity compared with your rolling 30-day daily average.</p>
          </div>
          <div class="flex items-center gap-4 text-[10px] font-semibold uppercase tracking-wide text-surface-400"><span>Last working day</span><span>30-day avg/day</span></div>
        </div>

        <div v-if="recruiterKpiStatus === 'pending'" class="flex items-center justify-center gap-2 px-5 py-10 text-sm text-surface-400"><Loader2 class="size-4 animate-spin" />Loading recruiter performance…</div>
        <div v-else class="grid lg:grid-cols-3">
          <div v-for="(group, groupIndex) in recruiterKpiGroups" :key="group.title" class="p-5" :class="groupIndex ? 'border-t border-surface-100 lg:border-l lg:border-t-0 dark:border-surface-800' : ''">
            <h3 class="text-sm font-bold text-surface-800 dark:text-surface-100">{{ group.title }}</h3>
            <p class="mt-0.5 text-[11px] text-surface-400">{{ group.description }}</p>
            <div class="mt-4 divide-y divide-surface-100 dark:divide-surface-800">
              <div v-for="item in group.items" :key="item.label" class="grid grid-cols-[1fr_52px_62px] items-center gap-2 py-2.5">
                <span class="text-xs font-medium text-surface-600 dark:text-surface-300">{{ item.label }}</span>
                <span class="text-right text-lg font-bold text-[#102A43] dark:text-white">{{ item.daily }}</span>
                <span class="text-right text-xs font-semibold text-surface-400">{{ item.average }}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="border-t border-surface-100 bg-[#F9FBFC] px-5 py-2.5 text-[10px] leading-4 text-surface-400 dark:border-surface-800 dark:bg-surface-950/30">
          Daily averages use the 30 calendar days ending on the previous working day. Interview, offer and joining movement is based on recruiter stage-event history. Candidate sourcing currently follows the application's recruiter ownership until immutable sourcing attribution is added.
        </div>
      </section>

      <section v-if="riskTotal || recruitment.actionPending" class="grid gap-3 lg:grid-cols-3" data-testid="priority-actions">
        <div class="lg:col-span-2 flex flex-wrap items-center gap-3 rounded-2xl border border-[#E6D7B5] bg-[#FFF9ED] px-5 py-4 dark:border-warning-900 dark:bg-warning-950/20">
          <span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-[#986C16] shadow-sm dark:bg-surface-900"><AlertTriangle class="size-4.5" /></span>
          <div class="min-w-0"><p class="text-sm font-bold text-[#664A13] dark:text-warning-200">Priority hiring attention</p><p class="mt-0.5 text-xs text-[#866A32] dark:text-warning-300">{{ recruitment.overdueRequirements }} overdue requisitions, {{ recruitment.dueSoonRequirements }} due soon and {{ recruitment.actionPending }} candidate actions pending.</p></div>
          <NuxtLink :to="localePath('/dashboard/closure-risk')" class="ml-auto inline-flex items-center gap-1 text-xs font-bold text-[#765410] no-underline hover:underline dark:text-warning-200">Review risks <ArrowRight class="size-3.5" /></NuxtLink>
        </div>
        <div class="flex items-center justify-between rounded-2xl border border-[#D6E8DD] bg-[#F5FBF7] px-5 py-4 dark:border-success-900 dark:bg-success-950/20">
          <div><p class="text-xs font-semibold uppercase tracking-wide text-[#5C7F66]">Requisition health</p><p class="mt-1 text-xl font-bold text-[#315C3D] dark:text-success-200">{{ requirementsOnTrack }} on track</p></div><CheckCircle2 class="size-6 text-[#4D8B5D]" />
        </div>
      </section>

      <div v-if="isEmpty" class="rounded-3xl border border-dashed border-[#BFD6E6] bg-[#F7FBFE] px-6 py-14 text-center dark:border-surface-700 dark:bg-surface-900">
        <Sparkles class="mx-auto size-8 text-[#176B87]" />
        <h2 class="mt-4 text-lg font-bold text-[#102A43] dark:text-white">{{ scope.allocatedOnly ? 'No requirements allocated yet' : 'No active recruitment yet' }}</h2>
        <p class="mx-auto mt-2 max-w-lg text-sm text-surface-500">{{ scope.allocatedOnly ? 'Your command centre will populate automatically when a requirement is allocated to you.' : 'Create a requirement to begin the recruitment workflow.' }}</p>
      </div>

      <template v-else>
        <div class="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
          <section class="rounded-2xl border border-surface-200 bg-white shadow-sm dark:border-surface-800 dark:bg-surface-900" data-testid="hiring-funnel">
            <div class="border-b border-surface-100 px-5 py-4 dark:border-surface-800">
              <h2 class="font-bold text-[#102A43] dark:text-white">Hiring Funnel</h2>
              <p class="mt-0.5 text-xs text-surface-400">Current candidate distribution across recruitment stages</p>
            </div>
            <div class="space-y-4 p-5">
              <div v-for="stage in pipelineStages" :key="stage.key">
                <div class="mb-1.5 flex items-center justify-between text-xs"><span class="font-semibold text-surface-600 dark:text-surface-300">{{ stage.label }}</span><span class="font-bold text-[#102A43] dark:text-white">{{ stage.value }}</span></div>
                <div class="h-2.5 overflow-hidden rounded-full bg-surface-100 dark:bg-surface-800"><div class="h-full rounded-full bg-[#2B7C92] transition-all" :style="{ width: pipelineWidth(stage.value) }" /></div>
              </div>
              <div class="grid grid-cols-2 gap-3 border-t border-surface-100 pt-4 dark:border-surface-800"><div class="rounded-xl bg-[#F7FAFC] p-3 dark:bg-surface-800/60"><p class="text-xs text-surface-400">Active pipeline</p><p class="mt-1 text-xl font-bold text-[#102A43] dark:text-white">{{ activePipeline }}</p></div><div class="rounded-xl bg-[#F7FAFC] p-3 dark:bg-surface-800/60"><p class="text-xs text-surface-400">Joined / closed outcomes</p><p class="mt-1 text-xl font-bold text-[#102A43] dark:text-white">{{ terminalPipeline }}</p></div></div>
              <p class="text-[11px] leading-4 text-surface-400">This view shows current pipeline distribution. Historical conversion ratios and recruiter performance trends are available in Recruitment Analytics where sufficient telemetry exists.</p>
            </div>
          </section>

          <section class="rounded-2xl border border-surface-200 bg-white shadow-sm dark:border-surface-800 dark:bg-surface-900" data-testid="requisition-health">
            <div class="flex items-center justify-between border-b border-surface-100 px-5 py-4 dark:border-surface-800">
              <div><h2 class="font-bold text-[#102A43] dark:text-white">{{ scope.allocatedOnly ? 'My Requisition Health' : 'Requisition Health' }}</h2><p class="mt-0.5 text-xs text-surface-400">TAT, target closure and candidate load at a glance</p></div>
              <NuxtLink :to="localePath('/dashboard/jobs')" class="text-xs font-bold text-[#176B87] no-underline hover:underline">View all</NuxtLink>
            </div>
            <div class="max-h-[470px] divide-y divide-surface-100 overflow-y-auto dark:divide-surface-800">
              <NuxtLink v-for="job in topJobs" :key="job.id" :to="localePath(`/dashboard/jobs/${job.id}`)" class="grid gap-3 px-5 py-4 no-underline transition hover:bg-[#F7FAFC] md:grid-cols-[1fr_auto] dark:hover:bg-surface-800/40">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2"><p class="truncate text-sm font-bold text-surface-900 dark:text-white">{{ job.title }}</p><span class="rounded-full bg-[#EAF4FB] px-2 py-0.5 text-[10px] font-semibold text-[#1F6FA3]">{{ job.applicationCount ?? 0 }} candidates</span></div>
                  <p class="mt-1.5 text-xs text-surface-400">Assigned {{ formatDate(job.assignmentDate) }} · Target {{ formatDate(job.targetClosureDate) }}</p>
                  <p class="mt-1 text-xs font-semibold" :class="daysTo(job.targetClosureDate) != null && daysTo(job.targetClosureDate)! < 0 ? 'text-danger-600' : daysTo(job.targetClosureDate) != null && daysTo(job.targetClosureDate)! <= 7 ? 'text-warning-700' : 'text-[#39784A]'">{{ tatLabel(job) }} · {{ closureLabel(job.targetClosureDate) }}</p>
                </div>
                <div class="flex min-w-[190px] items-center justify-between gap-3 text-center text-[10px] text-surface-400"><span><strong class="block text-sm text-surface-800 dark:text-surface-200">{{ job.screeningCount ?? 0 }}</strong>Screening</span><span><strong class="block text-sm text-surface-800 dark:text-surface-200">{{ job.interviewCount ?? 0 }}</strong>Interview</span><span><strong class="block text-sm text-surface-800 dark:text-surface-200">{{ job.offerCount ?? 0 }}</strong>Offer</span></div>
              </NuxtLink>
              <div v-if="!topJobs.length" class="px-5 py-10 text-center text-sm text-surface-400">No active requirements in your current scope.</div>
            </div>
          </section>
        </div>

        <section class="rounded-2xl border border-surface-200 bg-white shadow-sm dark:border-surface-800 dark:bg-surface-900" data-testid="candidate-movement">
          <div class="flex items-center justify-between border-b border-surface-100 px-5 py-4 dark:border-surface-800">
            <div><h2 class="font-bold text-[#102A43] dark:text-white">Candidate Movement</h2><p class="mt-0.5 text-xs text-surface-400">Latest movement across visible recruitment workflows</p></div>
            <NuxtLink :to="localePath('/dashboard/active-candidates')" class="text-xs font-bold text-[#176B87] no-underline hover:underline">Open active candidates</NuxtLink>
          </div>
          <div class="grid divide-y divide-surface-100 md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-4 dark:divide-surface-800">
            <NuxtLink v-for="row in recentApplications.slice(0, 8)" :key="row.id" :to="localePath(`/dashboard/recruitment/${row.id}`)" class="block min-w-0 px-5 py-4 no-underline hover:bg-[#F7FAFC] dark:hover:bg-surface-800/40">
              <div class="flex items-start gap-3"><span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#EAF7F5] text-[#187C73]"><UserRoundCheck class="size-4" /></span><div class="min-w-0"><p class="truncate text-sm font-bold text-surface-900 dark:text-white">{{ candidateName(row) }}</p><p class="mt-0.5 truncate text-xs text-surface-400">{{ row.jobTitle }}</p><div class="mt-2 flex flex-wrap items-center gap-1.5"><span class="rounded-full bg-[#EEF4F8] px-2 py-0.5 text-[10px] font-semibold text-[#345D75] dark:bg-surface-800 dark:text-surface-300">{{ stageLabel(row.recruitmentStatus || row.status) }}</span><span v-if="row.priority" class="rounded-full bg-[#FFF4E3] px-2 py-0.5 text-[10px] font-semibold text-[#8C6117]">{{ row.priority }}</span></div><p v-if="row.nextAction" class="mt-2 line-clamp-2 text-[11px] leading-4 text-surface-500">Next: {{ row.nextAction }}</p></div></div>
            </NuxtLink>
          </div>
          <div v-if="!recentApplications.length" class="px-5 py-10 text-center text-sm text-surface-400">Candidate movement will appear here as recruitment activity begins.</div>
        </section>
      </template>
    </template>
  </div>
</template>