<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'require-org'] })

const route = useRoute()
const localePath = useLocalePath()
const applicationId = route.params.id as string

// Keep historical/legacy links working without maintaining a second recruitment workflow.
// The governed PDS Recruitment Workspace is the single canonical application detail surface.
await navigateTo(localePath(`/dashboard/recruitment/${applicationId}`), { replace: true })
</script>

<template>
  <div class="py-12 text-center text-sm text-surface-400">Opening Recruitment Workspace…</div>
</template>
