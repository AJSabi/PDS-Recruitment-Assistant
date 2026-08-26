<script setup lang="ts">
import { AlertTriangle, ArrowLeft, BriefcaseBusiness, CalendarDays, Loader2, RefreshCw, Search, UserRoundCog, UsersRound } from 'lucide-vue-next'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'require-org'] })
useSeoMeta({ title: 'Requirement Allocation' })

const localePath = useLocalePath()
const toast = useToast()
const search = ref('')
const savingJobId = ref<string | null>(null)

const { data, status, error, refresh } = useFetch('/api/requirement-allocations', {
  key: 'pds-requirement-allocations',
  headers: useRequestHeaders(['cookie']),
})

const rows = computed(() => {
  const list = data.value?.requirements ?? []
  const q = search.value.trim().toLowerCase()
  if (!q) return list
  return list.filter((row: any) => [row.title, row.location, row.recruiterName, row.recruiterEmail, row.status]
    .some(value => String(value ?? '').toLowerCase().includes(q)))
})

function toInputDate(value?: string | Date | null) {
  if (!value) return ''
  const d = new Date(value)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function toIsoDate(value: string) {
  return value ? new Date(`${value}T00:00:00`).toISOString() : null
}

function plus60(value: string) {
  if (!value) return ''
  const d = new Date(`${value}T00:00:00`)
  d.setDate(d.getDate() + 60)
  return toInputDate(d)
}

type AllocationDraft = { ownerUserId: string; assignmentDate: string; targetClosureDate: string }
const drafts = reactive<any>({}) as Record<string, AllocationDraft>

watch(data, (value: any) => {
  for (const row of value?.requirements ?? []) {
    if (!drafts[row.jobId]) {
      drafts[row.jobId] = {
        ownerUserId: row.ownerUserId ?? '',
        assignmentDate: toInputDate(row.assignmentDate),
        targetClosureDate: toInputDate(row.targetClosureDate),
      }
    }
  }
}, { immediate: true })

function reload() {
  void refresh()
}

function workloadFor(userId?: string) {
  if (!userId) return 0
  const members = (data.value?.members ?? []) as any[]
  return Number(members.find(person => person.userId === userId)?.openRequirements ?? 0)
}

function onRecruiterChange(jobId: string) {
  const draft = drafts[jobId]
  if (!draft) return
  if (!draft.ownerUserId) {
    draft.assignmentDate = ''
    return
  }
  if (!draft.assignmentDate) draft.assignmentDate = toInputDate(new Date())
  if (!draft.targetClosureDate) draft.targetClosureDate = plus60(draft.assignmentDate)
}

function onAssignmentDateChange(jobId: string) {
  const draft = drafts[jobId]
  if (!draft?.assignmentDate || !draft.ownerUserId) return
  draft.targetClosureDate = plus60(draft.assignmentDate)
}

async function save(row: any) {
  const draft = drafts[row.jobId]
  if (!draft) return
  savingJobId.value = row.jobId
  try {
    await $fetch(`/api/requirement-allocations/${row.jobId}`, {
      method: 'PUT',
      body: {
        ownerUserId: draft.ownerUserId || null,
        assignmentDate: toIsoDate(draft.assignmentDate),
        targetClosureDate: toIsoDate(draft.targetClosureDate),
      },
    })
    await refresh()
    toast.success(draft.ownerUserId ? 'Requirement allocation updated' : 'Requirement unallocated')
  }
  catch (err: any) {
    toast.error('Could not update allocation', { message: err?.data?.statusMessage ?? err?.message })
  }
  finally {
    savingJobId.value = null
  }
}
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <NuxtLink :to="localePath('/dashboard/jobs')" class="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-[#1F6FA3] no-underline hover:underline"><ArrowLeft class="size-3.5" />Requirements</NuxtLink>
        <p class="text-xs font-semibold uppercase tracking-[0.16em] text-[#2E86C1]">Recruitment Governance</p>
        <h1 class="mt-1 text-2xl font-bold text-[#102A43] dark:text-white">Requirement Allocation</h1>
        <p class="mt-1 text-sm text-surface-500">Assign or reassign requirements after reviewing each recruiter's current open workload.</p>
      </div>
      <button class="inline-flex items-center gap-2 rounded-xl border border-surface-300 bg-white px-4 py-2 text-sm font-semibold text-surface-700 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-200" @click="reload"><RefreshCw class="size-4" />Refresh</button>
    </div>

    <div v-if="status === 'pending'" class="flex min-h-[45vh] items-center justify-center"><Loader2 class="size-7 animate-spin text-[#2E86C1]" /></div>

    <div v-else-if="error" class="rounded-2xl border border-danger-200 bg-danger-50 p-5 text-sm text-danger-700 dark:border-danger-900 dark:bg-danger-950/20 dark:text-danger-200">
      <div class="flex items-center gap-2"><AlertTriangle class="size-5" />You do not have access to requirement allocation, or the page could not be loaded.</div>
    </div>

    <template v-else>
      <section class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div class="rounded-2xl border border-[#CFE0ED] bg-white p-5 dark:border-surface-800 dark:bg-surface-900"><BriefcaseBusiness class="size-5 text-[#1F6FA3]" /><p class="mt-4 text-3xl font-bold text-[#102A43] dark:text-white">{{ data?.summary?.open ?? 0 }}</p><p class="text-sm font-semibold text-surface-600 dark:text-surface-300">Open Requirements</p></div>
        <div class="rounded-2xl border border-[#D7E9E7] bg-white p-5 dark:border-surface-800 dark:bg-surface-900"><UserRoundCog class="size-5 text-[#16847F]" /><p class="mt-4 text-3xl font-bold text-[#102A43] dark:text-white">{{ data?.summary?.allocated ?? 0 }}</p><p class="text-sm font-semibold text-surface-600 dark:text-surface-300">Allocated</p></div>
        <div class="rounded-2xl border border-[#F0DFC0] bg-white p-5 dark:border-surface-800 dark:bg-surface-900"><AlertTriangle class="size-5 text-[#A96F12]" /><p class="mt-4 text-3xl font-bold text-[#102A43] dark:text-white">{{ data?.summary?.unallocated ?? 0 }}</p><p class="text-sm font-semibold text-surface-600 dark:text-surface-300">Unallocated Open</p></div>
        <div class="rounded-2xl border border-surface-200 bg-white p-5 dark:border-surface-800 dark:bg-surface-900"><UsersRound class="size-5 text-[#486581]" /><p class="mt-4 text-3xl font-bold text-[#102A43] dark:text-white">{{ data?.members?.length ?? 0 }}</p><p class="text-sm font-semibold text-surface-600 dark:text-surface-300">Organisation Members</p></div>
      </section>

      <section class="rounded-2xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900">
        <div class="flex items-center gap-2 rounded-xl border border-surface-200 bg-surface-50 px-3 dark:border-surface-700 dark:bg-surface-800/50"><Search class="size-4 text-surface-400" /><input v-model="search" class="w-full bg-transparent py-2.5 text-sm outline-none" placeholder="Search requirement, recruiter, location or status" /></div>
      </section>

      <section class="overflow-x-auto rounded-2xl border border-surface-200 bg-white shadow-sm dark:border-surface-800 dark:bg-surface-900">
        <table class="min-w-full text-sm">
          <thead class="bg-[#F5F9FC] text-left text-[11px] uppercase tracking-wide text-[#486581] dark:bg-surface-800/60 dark:text-surface-400">
            <tr><th class="px-4 py-3">Requirement</th><th class="px-4 py-3">Recruiter</th><th class="px-4 py-3">Workload</th><th class="px-4 py-3">Assignment Date</th><th class="px-4 py-3">Target Closure</th><th class="px-4 py-3"></th></tr>
          </thead>
          <tbody class="divide-y divide-surface-100 dark:divide-surface-800">
            <tr v-for="row in rows" :key="row.jobId" class="align-top">
              <td class="min-w-[240px] px-4 py-4"><NuxtLink :to="localePath(`/dashboard/jobs/${row.jobId}`)" class="font-semibold text-[#102A43] no-underline hover:text-[#1F6FA3] hover:underline dark:text-white">{{ row.title }}</NuxtLink><p class="mt-1 text-xs text-surface-400">{{ row.location || 'Location not specified' }} · {{ row.status }}</p></td>
              <td class="min-w-[230px] px-4 py-4"><select v-model="drafts[row.jobId].ownerUserId" class="w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800" @change="onRecruiterChange(row.jobId)"><option value="">Unallocated</option><option v-for="person in data?.members ?? []" :key="person.userId" :value="person.userId">{{ person.name }} — {{ person.role }}</option></select></td>
              <td class="px-4 py-4 whitespace-nowrap"><template v-if="drafts[row.jobId]?.ownerUserId"><span class="rounded-full bg-[#EAF4FB] px-2.5 py-1 text-xs font-semibold text-[#1F6FA3]">{{ workloadFor(drafts[row.jobId].ownerUserId) }} open</span></template><span v-else class="text-xs text-surface-400">—</span></td>
              <td class="min-w-[165px] px-4 py-4"><div class="relative"><CalendarDays class="pointer-events-none absolute left-3 top-2.5 size-4 text-surface-400" /><input v-model="drafts[row.jobId].assignmentDate" type="date" :disabled="!drafts[row.jobId].ownerUserId" class="w-full rounded-lg border border-surface-300 bg-white py-2 pl-9 pr-2 text-sm disabled:bg-surface-100 dark:border-surface-700 dark:bg-surface-800 dark:disabled:bg-surface-900" @change="onAssignmentDateChange(row.jobId)" /></div></td>
              <td class="min-w-[165px] px-4 py-4"><input v-model="drafts[row.jobId].targetClosureDate" type="date" class="w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800" /></td>
              <td class="px-4 py-4 text-right"><button :disabled="savingJobId === row.jobId" class="inline-flex items-center gap-2 rounded-lg bg-[#2E86C1] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" @click="save(row)"><Loader2 v-if="savingJobId === row.jobId" class="size-3.5 animate-spin" />Save</button></td>
            </tr>
            <tr v-if="!rows.length"><td colspan="6" class="px-4 py-12 text-center text-sm text-surface-400">No matching requirements.</td></tr>
          </tbody>
        </table>
      </section>

      <p class="text-xs text-surface-400">When no target exists, allocation defaults Target Closure to Assignment Date + 60 days. An existing target is preserved during allocation or temporary unallocation unless an administrator changes it.</p>
    </template>
  </div>
</template>
