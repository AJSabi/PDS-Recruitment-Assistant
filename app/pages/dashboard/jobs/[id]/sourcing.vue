<script setup lang="ts">
const route = useRoute()
const jobId = route.params.id as string
const { job } = useJob(jobId)

useHead(() => ({ title: `${job.value?.title ?? 'Requirement'} · Sourcing Toolkit` }))
</script>

<template>
  <div class="space-y-5">
    <JobSubNavActions :job-id="jobId" />
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.16em] text-[#2E86C1]">PDS Recruitment</p>
      <h1 class="mt-1 text-2xl font-bold text-[#102A43] dark:text-white">Sourcing Toolkit</h1>
      <p class="mt-1 text-sm text-surface-500">{{ job?.title ?? 'Requirement' }} · major JD skills and recruiter-controlled Boolean search.</p>
    </div>
    <PdsSourcingToolkit :job-id="jobId" />
  </div>
</template>
