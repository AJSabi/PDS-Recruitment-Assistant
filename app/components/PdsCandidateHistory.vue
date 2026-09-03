<script setup lang="ts">
const props = defineProps<{ applicationId: string }>()
const { data, status, refresh } = useFetch(() => `/api/applications/${props.applicationId}/history`, {
  key: computed(() => `pds-history-${props.applicationId}`),
  headers: useRequestHeaders(['cookie']),
})
defineExpose({ refresh })

const stageLabels: Record<string, string> = {
  resume_reviewed: 'Moved to Recruitment',
  recruiter_screening_pending: 'Recruiter Screening Started',
  recruiter_screening_completed: 'Recruiter Screening Completed',
  hiring_manager_round_pending: 'Moved to Hiring Manager Round',
  hiring_manager_round_completed: 'Hiring Manager Round Completed',
  hod_round_pending: 'Moved to HOD Round',
  hod_round_completed: 'HOD Round Completed',
  hr_round_pending: 'Moved to HR Round',
  hr_round_completed: 'HR Round Completed',
  hold_for_comparison: 'Hold for Comparison',
  reassess: 'Reassessment Requested',
  not_proceeding: 'Not Proceeding',
  offer_stage: 'Moved to Offer Stage',
  offer_accepted: 'Offer Accepted',
  offer_declined: 'Offer Declined',
  joined: 'Joined',
  closed: 'Application Closed',
}

function label(value?: string | null) {
  return stageLabels[value ?? ''] ?? (value ?? '—').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
}
function date(value?: string | Date | null) {
  return value ? new Date(value).toLocaleString() : '—'
}

function milestone(item: any) {
  const payload = item?.payload ?? {}
  if (payload.event === 'talent_pool_promoted') return 'Moved to Recruitment'
  if (payload.event === 'stage_confirmed' && payload.to) return label(payload.to)
  if (item.type === 'screening') return 'Recruiter Screening'
  if (item.type === 'interview') return 'Interview Feedback'
  if (item.type === 'reassessment') return 'Reassessment'
  if (item.type === 'resume') return payload.event === 'talent_pool_promoted' ? 'Moved to Recruitment' : 'Resume Assessment'
  return label(item.type)
}

function visible(item: any) {
  const payload = item?.payload ?? {}
  if (payload.event === 'talent_pool_promoted' || payload.event === 'stage_confirmed') return true
  return ['screening', 'interview', 'reassessment', 'resume'].includes(item.type)
}

const timeline = computed(() => (data.value?.evidence ?? []).filter(visible))
</script>

<template>
  <section class="rounded-xl border border-surface-200 bg-white p-5 dark:border-surface-800 dark:bg-surface-900">
    <div class="mb-4">
      <h2 class="text-sm font-semibold text-surface-800 dark:text-surface-200">Candidate Journey</h2>
      <p class="mt-1 text-xs text-surface-500">Recruiter-facing timeline for this candidate against the current requirement. Full audit evidence remains stored in the system.</p>
    </div>

    <div v-if="status === 'pending'" class="py-6 text-center text-sm text-surface-400">Loading candidate journey…</div>

    <template v-else-if="data">
      <div class="mb-5 grid gap-3 sm:grid-cols-3">
        <div class="rounded-lg bg-surface-50 p-3 dark:bg-surface-800/60">
          <p class="text-[11px] uppercase text-surface-400">Current Stage</p>
          <p class="mt-1 text-sm font-semibold">{{ label(data.profile?.lastStatus) }}</p>
        </div>
        <div class="rounded-lg bg-surface-50 p-3 dark:bg-surface-800/60">
          <p class="text-[11px] uppercase text-surface-400">Current Fit</p>
          <p class="mt-1 text-sm font-semibold">{{ label(data.profile?.currentFit) }}</p>
        </div>
        <div class="rounded-lg bg-surface-50 p-3 dark:bg-surface-800/60">
          <p class="text-[11px] uppercase text-surface-400">Priority</p>
          <p class="mt-1 text-sm font-semibold">{{ data.profile?.priority ?? '—' }}</p>
        </div>
      </div>

      <div v-if="timeline.length" class="relative space-y-0">
        <div v-for="(item, index) in timeline" :key="item.id" class="relative flex gap-3 pb-5 last:pb-0">
          <div class="relative flex w-5 shrink-0 justify-center">
            <span class="mt-1.5 size-2.5 rounded-full bg-brand-600" />
            <span v-if="index < timeline.length - 1" class="absolute top-4 bottom-0 w-px bg-surface-200 dark:bg-surface-700" />
          </div>
          <div class="min-w-0 flex-1 rounded-lg border border-surface-200 p-3 dark:border-surface-700">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="text-xs font-semibold text-brand-700 dark:text-brand-300">{{ milestone(item) }}</span>
              <span class="text-xs text-surface-400">{{ date(item.createdAt) }}</span>
            </div>
            <p v-if="item.summary" class="mt-1 text-sm text-surface-700 dark:text-surface-200">{{ item.summary }}</p>
          </div>
        </div>
      </div>

      <div v-else class="rounded-lg border border-dashed border-surface-300 p-4 text-sm text-surface-500 dark:border-surface-700">No recruitment milestones recorded yet.</div>
    </template>
  </section>
</template>
