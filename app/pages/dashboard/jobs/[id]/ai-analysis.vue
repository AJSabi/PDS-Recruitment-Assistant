<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'require-org'] })
useSeoMeta({ title: 'JD & Skill Matrix', robots: 'noindex, nofollow' })
</script>

<template>
  <PdsJdSkillMatrix />
</template>
