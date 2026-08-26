<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'require-org'] })
useSeoMeta({ title: 'Requirements' })
const localePath = useLocalePath()
await navigateTo(localePath('/dashboard/jobs'), { replace: true })
</script>

<template>
  <div class="py-12 text-center text-sm text-surface-400">Opening PDS Requirements…</div>
</template>
