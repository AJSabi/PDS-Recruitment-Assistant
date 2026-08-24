<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'require-org'] })
useSeoMeta({ title: 'JD & Skill Matrix', robots: 'noindex, nofollow' })

const route = useRoute()
const localePath = useLocalePath()
const jobId = route.params.id as string
</script>

<template>
  <div>
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <NuxtLink :to="localePath(`/dashboard/jobs/${jobId}/ai-analysis`)" class="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white">JD & Skill Matrix</NuxtLink>
      <NuxtLink :to="localePath(`/dashboard/jobs/${jobId}/pds-ranking`)" class="rounded-lg border border-surface-300 px-3 py-2 text-sm font-semibold text-surface-700 hover:border-brand-400 hover:text-brand-700 dark:border-surface-700 dark:text-surface-300">Work Queue</NuxtLink>
      <NuxtLink :to="localePath(`/dashboard/jobs/${jobId}/pds-register`)" class="rounded-lg border border-surface-300 px-3 py-2 text-sm font-semibold text-surface-700 hover:border-brand-400 hover:text-brand-700 dark:border-surface-700 dark:text-surface-300">Candidate Register</NuxtLink>
      <NuxtLink :to="localePath(`/dashboard/jobs/${jobId}`)" class="rounded-lg border border-surface-300 px-3 py-2 text-sm font-semibold text-surface-700 hover:border-brand-400 hover:text-brand-700 dark:border-surface-700 dark:text-surface-300">Pipeline</NuxtLink>
    </div>
    <PdsJdSkillMatrix />
  </div>
</template>
