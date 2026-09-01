<script setup lang="ts">
import { ArrowLeft, Bot } from 'lucide-vue-next'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'require-org'] })
useSeoMeta({ title: 'AI Usage Analytics', description: 'PDS recruitment AI usage and configured-cost analytics' })
const localePath = useLocalePath()
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-6">
    <section class="rounded-3xl bg-[#102A43] px-6 py-7 text-white shadow-sm sm:px-8">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-[#9FD3F2]">Management Dashboard</p>
          <div class="mt-2 flex items-center gap-2"><Bot class="size-6 text-[#9FD3F2]" /><h1 class="text-2xl font-bold tracking-tight sm:text-3xl">AI Usage & Cost Analytics</h1></div>
          <p class="mt-2 max-w-3xl text-sm leading-6 text-[#D5E6F3]">Governed visibility into persisted AI analysis runs, token consumption, model usage and configured-price cost.</p>
        </div>
        <NuxtLink :to="localePath('/dashboard/management-analytics')" class="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white no-underline hover:bg-white/15"><ArrowLeft class="size-4" />Recruitment Analytics</NuxtLink>
      </div>
    </section>

    <ManagementAiUsageAnalytics />
  </div>
</template>
