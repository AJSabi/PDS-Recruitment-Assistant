<script setup lang="ts">
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3, Loader2 } from 'lucide-vue-next'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'require-org'] })
useSeoMeta({ title: 'Pending Actions', description: 'Recruiter actions pending across allocated requirements' })

const localePath = useLocalePath()
const { data, status, error, refresh } = useFetch('/api/dashboard/pending-actions', {
  key: 'pds-pending-actions',
  headers: useRequestHeaders(['cookie']),
})

const rows = computed<any[]>(() => data.value?.data ?? [])

function candidateName(row: any) {
  return `${row.candidateFirstName ?? ''} ${row.candidateLastName ?? ''}`.trim() || 'Candidate'
}

function stageLabel(value?: string | null) {
  return (value ?? 'candidate_added').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
}
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <NuxtLink :to="localePath('/dashboard')" class="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-surface-500 no-underline hover:text-[#1F6FA3]"><ArrowLeft class="size-3.5" />Dashboard</NuxtLink>
        <h1 class="text-2xl font-bold text-[#102A43] dark:text-white">Pending Actions</h1>
        <p class="mt-1 text-sm text-surface-500">Candidates in your visible requirements that currently need recruiter movement.</p>
      </div>
      <button type="button" class="rounded-lg border border-surface-300 px-3 py-2 text-sm font-semibold text-surface-600 dark:border-surface-700 dark:text-surface-300" @click="refresh()">Refresh</button>
    </div>

    <div v-if="status === 'pending'" class="rounded-2xl border border-surface-200 bg-white py-16 text-center dark:border-surface-800 dark:bg-surface-900">
      <Loader2 class="mx-auto size-6 animate-spin text-[#2E86C1]" /><p class="mt-3 text-sm text-surface-500">Loading pending actions…</p>
    </div>

    <div v-else-if="error" class="rounded-2xl border border-danger-200 bg-danger-50 p-5 text-sm text-danger-700">Pending actions could not be loaded. Please retry.</div>

    <div v-else-if="!rows.length" class="rounded-2xl border border-[#D7E9E7] bg-[#F4FBFA] px-6 py-14 text-center dark:border-surface-700 dark:bg-surface-900">
      <CheckCircle2 class="mx-auto size-8 text-[#16847F]" />
      <h2 class="mt-3 font-bold text-[#102A43] dark:text-white">No pending recruiter actions</h2>
      <p class="mt-1 text-sm text-surface-500">There are no candidates waiting for movement in your current requirement scope.</p>
    </div>

    <section v-else class="overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-sm dark:border-surface-800 dark:bg-surface-900">
      <div class="border-b border-surface-100 px-5 py-4 dark:border-surface-800">
        <p class="text-sm font-semibold text-[#102A43] dark:text-white">{{ rows.length }} action{{ rows.length === 1 ? '' : 's' }} pending</p>
      </div>
      <div class="divide-y divide-surface-100 dark:divide-surface-800">
        <NuxtLink v-for="row in rows" :key="row.id" :to="localePath(`/dashboard/recruitment/${row.id}`)" class="grid gap-3 px-5 py-4 no-underline transition hover:bg-[#F7FBFE] sm:grid-cols-[1fr_auto] dark:hover:bg-surface-800/40">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <p class="truncate text-sm font-semibold text-surface-900 dark:text-white">{{ candidateName(row) }}</p>
              <span v-if="row.priority" class="rounded-full bg-[#102A43] px-2 py-0.5 text-[10px] font-bold text-white">{{ row.priority }}</span>
            </div>
            <p class="mt-0.5 truncate text-xs text-surface-500">{{ row.jobTitle }}</p>
            <p class="mt-2 inline-flex items-start gap-1.5 text-xs font-semibold text-[#16847F]"><Clock3 class="mt-0.5 size-3.5 shrink-0" />{{ row.nextAction }}</p>
          </div>
          <div class="flex items-center gap-3 self-center">
            <span class="text-xs text-surface-400">{{ stageLabel(row.recruitmentStatus) }}</span>
            <span class="inline-flex items-center gap-1 text-xs font-semibold text-[#1F6FA3]">Open <ArrowRight class="size-3.5" /></span>
          </div>
        </NuxtLink>
      </div>
    </section>
  </div>
</template>
