<script setup lang="ts">
import { ArrowLeft, CheckCircle2, CircleDashed, ClipboardList, FileText, Sparkles, Target, UsersRound } from 'lucide-vue-next'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'require-org'] })
useSeoMeta({ title: 'JD & Skill Matrix', robots: 'noindex, nofollow' })

const route = useRoute()
const localePath = useLocalePath()
const jobId = route.params.id as string

const { data: requirementData } = useFetch(() => `/api/jobs/${jobId}/requirement-profile`, {
  key: `pds-requirement-profile-${jobId}`,
  headers: useRequestHeaders(['cookie']),
})
const { data: matrixData } = useFetch(() => `/api/jobs/${jobId}/skill-matrix`, {
  key: `pds-skill-matrix-shell-${jobId}`,
  headers: useRequestHeaders(['cookie']),
})
const { job } = useJob(jobId)

const profile = computed<any>(() => requirementData.value?.profile ?? null)
const matrixApproved = computed(() => Boolean(matrixData.value?.approved))
const hasJd = computed(() => Boolean(job.value?.description?.trim()))
const hasProfile = computed(() => Boolean(profile.value))

function value(v: unknown) {
  if (v === null || v === undefined || v === '') return 'Not Specified'
  return String(v).replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
}
function dateValue(v: unknown) {
  if (!v) return 'Not Specified'
  return new Date(String(v)).toLocaleDateString()
}

const steps = computed(() => [
  { label: 'Requirement Profile', detail: 'Recruitment context', complete: hasProfile.value },
  { label: 'Active JD', detail: 'Saved source document', complete: hasJd.value },
  { label: 'Skill Matrix', detail: matrixApproved.value ? 'Approved' : 'Review required', complete: matrixApproved.value },
  { label: 'AI Candidate Pool', detail: matrixApproved.value ? 'Ready for matching' : 'Unlocks after approval', complete: matrixApproved.value },
])
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6">
    <div class="flex flex-wrap items-center gap-2">
      <NuxtLink :to="localePath(`/dashboard/jobs/${jobId}`)" class="inline-flex items-center gap-1.5 rounded-lg border border-surface-300 px-3 py-1.5 text-sm font-medium text-surface-600 hover:border-brand-400 hover:text-brand-700 dark:border-surface-700 dark:text-surface-300"><ArrowLeft class="size-4" />Pipeline</NuxtLink>
      <NuxtLink :to="localePath(`/dashboard/jobs/${jobId}/pds-ranking`)" class="inline-flex items-center gap-1.5 rounded-lg border border-surface-300 px-3 py-1.5 text-sm font-medium text-surface-600 hover:border-brand-400 hover:text-brand-700 dark:border-surface-700 dark:text-surface-300"><UsersRound class="size-4" />AI Candidate Pool</NuxtLink>
      <NuxtLink :to="localePath(`/dashboard/jobs/${jobId}/pds-register`)" class="inline-flex items-center gap-1.5 rounded-lg border border-surface-300 px-3 py-1.5 text-sm font-medium text-surface-600 hover:border-brand-400 hover:text-brand-700 dark:border-surface-700 dark:text-surface-300"><ClipboardList class="size-4" />Candidate Register</NuxtLink>
    </div>

    <section class="overflow-hidden rounded-3xl bg-[#102A43] text-white shadow-sm">
      <div class="px-6 py-6 sm:px-8">
        <div class="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-[#9FD3F2]">Requirement Setup</p>
            <h1 class="mt-2 text-3xl font-bold tracking-tight">{{ job?.title ?? 'JD & Skill Matrix' }}</h1>
            <p class="mt-2 max-w-3xl text-sm leading-6 text-[#D5E6F3]">Define the requirement once, validate what AI extracted, and approve the evidence framework before candidate matching begins.</p>
          </div>
          <div class="rounded-2xl border px-4 py-3" :class="matrixApproved ? 'border-[#6ED2C8]/40 bg-[#16847F]/20' : 'border-[#8FC8E8]/30 bg-white/5'">
            <p class="text-[10px] font-bold uppercase tracking-wide text-[#BFE7F8]">Candidate Matching</p>
            <p class="mt-1 flex items-center gap-2 text-sm font-bold"><CheckCircle2 v-if="matrixApproved" class="size-4 text-[#79DDD3]" /><CircleDashed v-else class="size-4 text-[#9FD3F2]" />{{ matrixApproved ? 'Ready' : 'Waiting for approval' }}</p>
          </div>
        </div>

        <div class="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div v-for="(step, index) in steps" :key="step.label" class="rounded-2xl border p-4" :class="step.complete ? 'border-[#52B7D8]/25 bg-[#2E86C1]/15' : 'border-white/10 bg-white/5'">
            <div class="flex items-start gap-3">
              <div class="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-black" :class="step.complete ? 'bg-[#22A6A1] text-white' : 'bg-white/10 text-[#AFCDE1]'">{{ index + 1 }}</div>
              <div><p class="text-sm font-bold">{{ step.label }}</p><p class="mt-1 text-xs" :class="step.complete ? 'text-[#BFE7F8]' : 'text-[#AFCDE1]'">{{ step.detail }}</p></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section v-if="profile" class="rounded-2xl border border-[#CFE0ED] bg-white p-5 shadow-sm dark:border-surface-800 dark:bg-surface-900">
      <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div><div class="flex items-center gap-2"><Target class="size-5 text-[#2E86C1]" /><h2 class="font-bold text-[#102A43] dark:text-white">Requirement Profile</h2></div><p class="mt-1 text-sm text-surface-500">Context extracted or captured for this requirement. Missing optional information remains Not Specified.</p></div>
        <span class="rounded-full bg-[#EAF4FB] px-3 py-1 text-xs font-semibold text-[#1F6FA3] dark:bg-brand-950/30 dark:text-brand-300">Recruitment context</span>
      </div>

      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div class="rounded-xl bg-[#F6F9FC] p-3 dark:bg-surface-800/60"><p class="text-[10px] font-bold uppercase tracking-wide text-surface-400">Job Title</p><p class="mt-1 text-sm font-semibold">{{ value(profile.jobTitle) }}</p></div>
        <div class="rounded-xl bg-[#F6F9FC] p-3 dark:bg-surface-800/60"><p class="text-[10px] font-bold uppercase tracking-wide text-surface-400">Function</p><p class="mt-1 text-sm font-semibold">{{ value(profile.functionName) }}</p></div>
        <div class="rounded-xl bg-[#F6F9FC] p-3 dark:bg-surface-800/60"><p class="text-[10px] font-bold uppercase tracking-wide text-surface-400">Hiring Manager</p><p class="mt-1 text-sm font-semibold">{{ value(profile.hiringManager) }}</p></div>
        <div class="rounded-xl bg-[#F6F9FC] p-3 dark:bg-surface-800/60"><p class="text-[10px] font-bold uppercase tracking-wide text-surface-400">Location</p><p class="mt-1 text-sm font-semibold">{{ value(profile.location) }}</p></div>
        <div class="rounded-xl bg-[#F6F9FC] p-3 dark:bg-surface-800/60"><p class="text-[10px] font-bold uppercase tracking-wide text-surface-400">Experience</p><p class="mt-1 text-sm font-semibold">{{ value(profile.experienceRequirement) }}</p></div>
        <div class="rounded-xl bg-[#F6F9FC] p-3 dark:bg-surface-800/60"><p class="text-[10px] font-bold uppercase tracking-wide text-surface-400">Seniority</p><p class="mt-1 text-sm font-semibold">{{ value(profile.seniority) }}</p></div>
        <div class="rounded-xl bg-[#F6F9FC] p-3 dark:bg-surface-800/60"><p class="text-[10px] font-bold uppercase tracking-wide text-surface-400">Openings</p><p class="mt-1 text-sm font-semibold">{{ value(profile.openings) }}</p></div>
        <div class="rounded-xl bg-[#F6F9FC] p-3 dark:bg-surface-800/60"><p class="text-[10px] font-bold uppercase tracking-wide text-surface-400">Closure Date</p><p class="mt-1 text-sm font-semibold">{{ dateValue(profile.closureDate) }}</p></div>
      </div>

      <div v-if="profile.majorRequirements?.length" class="mt-4 rounded-xl border border-[#D7E9E7] bg-[#F4FBFA] p-4 dark:border-surface-700 dark:bg-surface-800/40">
        <div class="flex items-center gap-2"><Sparkles class="size-4 text-[#16847F]" /><p class="text-xs font-bold uppercase tracking-wide text-[#16847F]">Major Requirements</p></div>
        <div class="mt-3 grid gap-2 md:grid-cols-2"><div v-for="item in profile.majorRequirements" :key="item" class="flex items-start gap-2 text-sm leading-5"><CheckCircle2 class="mt-0.5 size-4 shrink-0 text-[#22A6A1]" /><span>{{ item }}</span></div></div>
      </div>
    </section>

    <section v-else class="rounded-2xl border border-dashed border-surface-300 bg-white p-5 text-sm text-surface-500 dark:border-surface-700 dark:bg-surface-900">
      <div class="flex items-center gap-2"><FileText class="size-4" />Requirement Profile is not yet available. The JD and Skill Matrix can still be reviewed below.</div>
    </section>

    <PdsJdSkillMatrix />
  </div>
</template>
