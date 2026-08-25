<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'require-org'] })
useSeoMeta({ title: 'JD & Skill Matrix', robots: 'noindex, nofollow' })

const route = useRoute()
const localePath = useLocalePath()
const jobId = route.params.id as string
const { data: requirementData } = useFetch(() => `/api/jobs/${jobId}/requirement-profile`, {
  key: `pds-requirement-profile-${jobId}`,
  headers: useRequestHeaders(['cookie']),
})
const profile = computed<any>(() => requirementData.value?.profile ?? null)

function value(v: unknown) {
  if (v === null || v === undefined || v === '') return 'Not Specified'
  return String(v).replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
}
function dateValue(v: unknown) {
  if (!v) return 'Not Specified'
  return new Date(String(v)).toLocaleDateString()
}
</script>

<template>
  <div>
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <NuxtLink :to="localePath(`/dashboard/jobs/${jobId}/ai-analysis`)" class="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white">JD & Skill Matrix</NuxtLink>
      <NuxtLink :to="localePath(`/dashboard/jobs/${jobId}/pds-ranking`)" class="rounded-lg border border-surface-300 px-3 py-2 text-sm font-semibold text-surface-700 hover:border-brand-400 hover:text-brand-700 dark:border-surface-700 dark:text-surface-300">AI Candidate Pool</NuxtLink>
      <NuxtLink :to="localePath(`/dashboard/jobs/${jobId}/pds-register`)" class="rounded-lg border border-surface-300 px-3 py-2 text-sm font-semibold text-surface-700 hover:border-brand-400 hover:text-brand-700 dark:border-surface-700 dark:text-surface-300">Candidate Register</NuxtLink>
      <NuxtLink :to="localePath(`/dashboard/jobs/${jobId}`)" class="rounded-lg border border-surface-300 px-3 py-2 text-sm font-semibold text-surface-700 hover:border-brand-400 hover:text-brand-700 dark:border-surface-700 dark:text-surface-300">Pipeline</NuxtLink>
    </div>

    <section v-if="profile" class="mb-6 rounded-xl border border-surface-200 bg-white p-5 dark:border-surface-800 dark:bg-surface-900">
      <div class="mb-3"><h2 class="text-sm font-semibold text-surface-800 dark:text-surface-200">Requirement Profile</h2><p class="mt-1 text-xs text-surface-500">Recruitment context captured when the requirement was created.</p></div>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div><p class="text-[11px] uppercase tracking-wide text-surface-400">Job Title</p><p class="mt-1 text-sm font-medium">{{ value(profile.jobTitle) }}</p></div>
        <div><p class="text-[11px] uppercase tracking-wide text-surface-400">Function</p><p class="mt-1 text-sm font-medium">{{ value(profile.functionName) }}</p></div>
        <div><p class="text-[11px] uppercase tracking-wide text-surface-400">Hiring Manager</p><p class="mt-1 text-sm font-medium">{{ value(profile.hiringManager) }}</p></div>
        <div><p class="text-[11px] uppercase tracking-wide text-surface-400">Location</p><p class="mt-1 text-sm font-medium">{{ value(profile.location) }}</p></div>
        <div><p class="text-[11px] uppercase tracking-wide text-surface-400">Experience</p><p class="mt-1 text-sm font-medium">{{ value(profile.experienceRequirement) }}</p></div>
        <div><p class="text-[11px] uppercase tracking-wide text-surface-400">Seniority</p><p class="mt-1 text-sm font-medium">{{ value(profile.seniority) }}</p></div>
        <div><p class="text-[11px] uppercase tracking-wide text-surface-400">Openings</p><p class="mt-1 text-sm font-medium">{{ value(profile.openings) }}</p></div>
        <div><p class="text-[11px] uppercase tracking-wide text-surface-400">Closure Date</p><p class="mt-1 text-sm font-medium">{{ dateValue(profile.closureDate) }}</p></div>
      </div>
      <div v-if="profile.majorRequirements?.length" class="mt-4 border-t border-surface-100 pt-3 dark:border-surface-800"><p class="text-[11px] uppercase tracking-wide text-surface-400">Major Requirements</p><ul class="mt-1 list-disc space-y-1 pl-5 text-sm"><li v-for="item in profile.majorRequirements" :key="item">{{ item }}</li></ul></div>
    </section>

    <PdsJdSkillMatrix />
  </div>
</template>
