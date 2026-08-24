<script setup lang="ts">
import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, RefreshCw } from 'lucide-vue-next'
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'require-org'] })
useSeoMeta({ title: 'Recruitment TAT' })

const localePath = useLocalePath()
const filter = ref<'all' | 'approaching' | 'overdue'>('all')
const editing = ref<string | null>(null)
const saving = ref(false)
const toast = useToast()
const form = reactive({ assignmentDate: '', targetClosureDate: '' })

const { data, status, refresh } = useFetch('/api/recruitment/tat', {
  key: 'pds-recruitment-tat',
  headers: useRequestHeaders(['cookie']),
})

const rows = computed<any[]>(() => {
  const source = data.value?.rows ?? []
  if (filter.value === 'overdue') return source.filter((row: any) => row.overdue)
  if (filter.value === 'approaching') return source.filter((row: any) => row.approaching)
  return source
})

function dateInput(value?: string | Date | null) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

function displayDate(value?: string | Date | null) {
  return value ? new Date(value).toLocaleDateString() : '—'
}

function startEdit(row: any) {
  editing.value = row.jobId
  form.assignmentDate = dateInput(row.assignmentDate)
  form.targetClosureDate = dateInput(row.targetClosureDate)
}

function iso(value: string) {
  return value ? `${value}T00:00:00.000Z` : null
}

async function saveTiming(row: any) {
  if (!form.assignmentDate) return toast.warning('Assignment date required')
  saving.value = true
  try {
    await $fetch(`/api/jobs/${row.jobId}/requirement-timing`, {
      method: 'PUT',
      body: {
        assignmentDate: iso(form.assignmentDate),
        targetClosureDate: form.targetClosureDate ? iso(form.targetClosureDate) : undefined,
      },
    })
    editing.value = null
    await refresh()
    toast.success('Requirement timing updated')
  } catch (err: any) {
    toast.error('Could not update timing', { message: err?.data?.statusMessage ?? err?.message })
  } finally { saving.value = false }
}
</script>

<template>
  <div class="mx-auto max-w-7xl">
    <div class="mb-4 flex flex-wrap gap-2">
      <NuxtLink :to="localePath('/dashboard/recruitment')" class="rounded-lg border border-surface-300 px-3 py-2 text-sm font-medium text-surface-600 hover:border-brand-400 hover:text-brand-700 dark:border-surface-700 dark:text-surface-300">Operations</NuxtLink>
      <NuxtLink :to="localePath('/dashboard/recruitment/my-work')" class="rounded-lg border border-surface-300 px-3 py-2 text-sm font-medium text-surface-600 hover:border-brand-400 hover:text-brand-700 dark:border-surface-700 dark:text-surface-300">My Work</NuxtLink>
      <NuxtLink :to="localePath('/dashboard/recruitment/workload')" class="rounded-lg border border-surface-300 px-3 py-2 text-sm font-medium text-surface-600 hover:border-brand-400 hover:text-brand-700 dark:border-surface-700 dark:text-surface-300">Recruiter Workload</NuxtLink>
    </div>

    <header class="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-xs font-medium uppercase tracking-wide text-surface-400">PDS Recruitment TAT</p>
        <h1 class="mt-1 text-2xl font-bold">Requirement Ageing & Closure Tracking</h1>
        <p class="mt-1 text-sm text-surface-500">Tracks each requirement from assignment against the standard 60-day closure target.</p>
      </div>
      <button class="inline-flex items-center gap-2 rounded-lg border border-surface-300 px-3 py-2 text-sm font-medium" @click="refresh"><RefreshCw class="size-4" />Refresh</button>
    </header>

    <div v-if="status === 'pending'" class="py-12 text-center text-surface-400">Loading TAT data…</div>
    <template v-else>
      <div class="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div class="rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900"><div class="flex items-center gap-2 text-surface-500"><CalendarClock class="size-4" /><span class="text-xs uppercase">Requirements</span></div><p class="mt-2 text-2xl font-bold">{{ data?.summary?.requirements ?? 0 }}</p></div>
        <div class="rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900"><div class="flex items-center gap-2 text-brand-600"><Clock3 class="size-4" /><span class="text-xs uppercase">Open</span></div><p class="mt-2 text-2xl font-bold">{{ data?.summary?.open ?? 0 }}</p></div>
        <div class="rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900"><div class="flex items-center gap-2 text-success-600"><CheckCircle2 class="size-4" /><span class="text-xs uppercase">Within Target</span></div><p class="mt-2 text-2xl font-bold">{{ data?.summary?.withinTarget ?? 0 }}</p></div>
        <div class="rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900"><div class="flex items-center gap-2 text-warning-600"><AlertTriangle class="size-4" /><span class="text-xs uppercase">Due ≤10 Days</span></div><p class="mt-2 text-2xl font-bold">{{ data?.summary?.approaching ?? 0 }}</p></div>
        <div class="rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900"><div class="flex items-center gap-2 text-danger-600"><AlertTriangle class="size-4" /><span class="text-xs uppercase">Overdue</span></div><p class="mt-2 text-2xl font-bold">{{ data?.summary?.overdue ?? 0 }}</p></div>
      </div>

      <div class="mb-4 flex flex-wrap gap-2">
        <button v-for="option in [{key:'all',label:'All'},{key:'approaching',label:'Due ≤10 Days'},{key:'overdue',label:'Overdue'}]" :key="option.key" class="rounded-lg px-3 py-1.5 text-sm font-medium" :class="filter === option.key ? 'bg-brand-600 text-white' : 'border border-surface-300 text-surface-600 dark:border-surface-700 dark:text-surface-300'" @click="filter = option.key as any">{{ option.label }}</button>
      </div>

      <div class="mb-6 overflow-x-auto rounded-xl border border-surface-200 bg-white dark:border-surface-800 dark:bg-surface-900">
        <table class="min-w-full text-sm">
          <thead class="bg-surface-50 text-left text-xs uppercase tracking-wide text-surface-500 dark:bg-surface-800/60"><tr><th class="px-4 py-3">Requirement</th><th class="px-4 py-3">Owner</th><th class="px-4 py-3">Assignment Date</th><th class="px-4 py-3">Target Closure</th><th class="px-4 py-3">Days Open</th><th class="px-4 py-3">Target Position</th><th class="px-4 py-3">Active Candidates</th><th class="px-4 py-3">Timing</th></tr></thead>
          <tbody class="divide-y divide-surface-100 dark:divide-surface-800">
            <tr v-for="row in rows" :key="row.jobId" class="hover:bg-surface-50 dark:hover:bg-surface-800/30">
              <td class="px-4 py-3 min-w-[230px]"><NuxtLink :to="localePath(`/dashboard/jobs/${row.jobId}/pds-ranking`)" class="font-semibold text-brand-600 hover:underline">{{ row.title }}</NuxtLink><div class="text-xs text-surface-400">{{ row.location || 'Location not specified' }}</div></td>
              <td class="px-4 py-3 min-w-[150px]">{{ row.ownerName ?? 'Unassigned' }}</td>
              <td class="px-4 py-3 whitespace-nowrap"><input v-if="editing === row.jobId" v-model="form.assignmentDate" type="date" class="rounded-lg border border-surface-300 px-2 py-1.5 dark:border-surface-700 dark:bg-surface-800" /><span v-else>{{ displayDate(row.assignmentDate) }}</span></td>
              <td class="px-4 py-3 whitespace-nowrap"><input v-if="editing === row.jobId" v-model="form.targetClosureDate" type="date" class="rounded-lg border border-surface-300 px-2 py-1.5 dark:border-surface-700 dark:bg-surface-800" /><span v-else>{{ displayDate(row.targetClosureDate) }}</span></td>
              <td class="px-4 py-3 font-semibold">{{ row.daysOpen }}</td>
              <td class="px-4 py-3 min-w-[150px]"><span v-if="row.isClosed" class="font-medium text-surface-500">Closed</span><span v-else-if="row.overdue" class="font-semibold text-danger-600">{{ Math.abs(row.daysToTarget) }} days overdue</span><span v-else-if="row.approaching" class="font-semibold text-warning-600">{{ row.daysToTarget }} days remaining</span><span v-else class="font-medium text-success-600">{{ row.daysToTarget }} days remaining</span></td>
              <td class="px-4 py-3">{{ row.activeCandidates }}</td>
              <td class="px-4 py-3"><div v-if="editing === row.jobId" class="flex gap-2"><button :disabled="saving" class="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50" @click="saveTiming(row)">Save</button><button class="rounded-lg border border-surface-300 px-3 py-1.5 text-xs" @click="editing = null">Cancel</button></div><button v-else class="rounded-lg border border-surface-300 px-3 py-1.5 text-xs font-medium" @click="startEdit(row)">Edit Dates</button></td>
            </tr>
          </tbody>
        </table>
      </div>

      <section class="rounded-xl border border-surface-200 bg-white p-5 dark:border-surface-800 dark:bg-surface-900">
        <h2 class="text-sm font-semibold text-surface-800 dark:text-surface-200">TAT by Requirement Owner</h2>
        <div class="mt-4 overflow-x-auto"><table class="min-w-full text-sm"><thead class="text-left text-xs uppercase text-surface-500"><tr><th class="px-3 py-2">Owner</th><th class="px-3 py-2">Requirements</th><th class="px-3 py-2">Open</th><th class="px-3 py-2">Due ≤10 Days</th><th class="px-3 py-2">Overdue</th><th class="px-3 py-2">Avg Days Open</th></tr></thead><tbody class="divide-y divide-surface-100 dark:divide-surface-800"><tr v-for="owner in data?.owners ?? []" :key="owner.ownerUserId ?? 'unassigned'"><td class="px-3 py-2 font-medium">{{ owner.ownerName }}</td><td class="px-3 py-2">{{ owner.requirements }}</td><td class="px-3 py-2">{{ owner.open }}</td><td class="px-3 py-2">{{ owner.approaching }}</td><td class="px-3 py-2" :class="owner.overdue ? 'font-semibold text-danger-600' : ''">{{ owner.overdue }}</td><td class="px-3 py-2">{{ owner.averageDaysOpen }}</td></tr></tbody></table></div>
      </section>
    </template>
  </div>
</template>
