<script setup lang="ts">
import { ArrowLeft, FileUp } from '@lucide/vue'

const route = useRoute()
const jobId = route.params.id as string
const localePath = useLocalePath()
const { job } = useJob(jobId)

useHead(() => ({ title: `${job.value?.title ?? 'Requirement'} · Sourcing Toolkit` }))
</script>

<template>
  <div class="mx-auto w-full max-w-7xl space-y-5 px-4 pb-8 sm:px-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <button type="button" class="inline-flex items-center gap-2 rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm font-semibold text-surface-700 hover:bg-surface-50 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-200" @click="navigateTo(localePath(`/dashboard/jobs/${jobId}`))">
        <ArrowLeft class="size-4" />Back to JD & Skill Matrix
      </button>
      <button type="button" class="inline-flex items-center gap-2 rounded-lg border border-[#B9D4E7] bg-[#F7FBFE] px-3 py-2 text-sm font-semibold text-[#1F6FA3] hover:border-[#2E86C1]" @click="navigateTo(localePath(`/dashboard/jobs/${jobId}/jd-upload`))">
        <FileUp class="size-4" />Upload / Replace JD
      </button>
    </div>

    <section class="rounded-2xl border border-[#CFE0ED] bg-white p-5 shadow-sm dark:border-surface-800 dark:bg-surface-900">
      <p class="text-xs font-semibold uppercase tracking-[0.16em] text-[#2E86C1]">PDS Recruitment</p>
      <h1 class="mt-1 text-2xl font-bold text-[#102A43] dark:text-white">Sourcing Toolkit</h1>
      <p class="mt-1 text-sm text-surface-500">{{ job?.title ?? 'Requirement' }} · major JD skills and recruiter-controlled Boolean search.</p>
    </section>

    <PdsSourcingToolkit :job-id="jobId" />
  </div>
</template>
