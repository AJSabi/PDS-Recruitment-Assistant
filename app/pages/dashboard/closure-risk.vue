<script setup lang="ts">
import { AlertTriangle, ArrowLeft, ArrowRight, Loader2, Target } from 'lucide-vue-next'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'require-org'] })
useSeoMeta({ title: 'Closure Risk' })
const localePath = useLocalePath()
const { data, status, error, refresh } = useFetch('/api/dashboard/closure-risk', { key: 'pds-closure-risk', headers: useRequestHeaders(['cookie']) })
const rows = computed<any[]>(() => data.value?.data ?? [])
const riskRows = computed(() => rows.value.filter(row => Number(row.daysToClosure) <= 7))
function closureText(days: number) {
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`
  if (days === 0) return 'Due today'
  return `${days} day${days === 1 ? '' : 's'} remaining`
}
function formatDate(value?: string | null) { return value ? new Date(value).toLocaleDateString() : 'Not set' }
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div><NuxtLink :to="localePath('/dashboard')" class="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-surface-500 no-underline hover:text-[#1F6FA3]"><ArrowLeft class="size-3.5" />Dashboard</NuxtLink><h1 class="text-2xl font-bold text-[#102A43] dark:text-white">Closure Risk</h1><p class="mt-1 text-sm text-surface-500">Active requirements already overdue or due within 7 days. Opening duration is measured from recruiter assignment.</p></div>
      <button class="rounded-lg border border-surface-300 px-3 py-2 text-sm font-semibold" @click="refresh()">Refresh</button>
    </div>
    <div v-if="status === 'pending'" class="py-16 text-center"><Loader2 class="mx-auto size-6 animate-spin text-[#2E86C1]" /></div>
    <div v-else-if="error" class="rounded-2xl border border-danger-200 bg-danger-50 p-5 text-sm text-danger-700">Closure risk could not be loaded.</div>
    <div v-else-if="!riskRows.length" class="rounded-2xl border border-dashed border-surface-300 bg-white p-12 text-center dark:border-surface-700 dark:bg-surface-900"><Target class="mx-auto size-8 text-[#16847F]" /><p class="mt-3 font-semibold">No immediate closure risk</p></div>
    <section v-else class="overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-sm dark:border-surface-800 dark:bg-surface-900">
      <div class="divide-y divide-surface-100 dark:divide-surface-800">
        <NuxtLink v-for="row in riskRows" :key="row.jobId" :to="localePath(`/dashboard/jobs/${row.jobId}`)" class="grid gap-3 px-5 py-4 no-underline hover:bg-[#F7FBFE] sm:grid-cols-[1fr_auto] dark:hover:bg-surface-800/40">
          <div><div class="flex flex-wrap items-center gap-2"><p class="font-semibold text-surface-900 dark:text-white">{{ row.title }}</p><span class="rounded-full px-2 py-0.5 text-[10px] font-bold" :class="Number(row.daysToClosure) < 0 ? 'bg-danger-50 text-danger-700' : 'bg-warning-50 text-warning-700'"><AlertTriangle class="mr-1 inline size-3" />{{ closureText(Number(row.daysToClosure)) }}</span></div><p class="mt-1 text-xs text-surface-500">Assigned: {{ formatDate(row.assignmentDate) }} · Target: {{ formatDate(row.targetClosureDate) }} · {{ row.openDays == null ? 'TAT not started' : `Open for ${row.openDays} days` }}</p></div>
          <span class="inline-flex items-center gap-1 self-center text-xs font-semibold text-[#1F6FA3]">Open <ArrowRight class="size-3.5" /></span>
        </NuxtLink>
      </div>
    </section>
  </div>
</template>
