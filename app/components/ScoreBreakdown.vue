<script setup lang="ts">
import { ArrowRight, BrainCircuit, CheckCircle2, Clock3, FileSearch } from '@lucide/vue'

const props = defineProps<{ applicationId: string }>()
const localePath = useLocalePath()

const { data, status, error } = useFetch(() => `/api/applications/${props.applicationId}/recruitment-profile`, {
  key: computed(() => `pds-score-bridge-${props.applicationId}`),
  headers: useRequestHeaders(['cookie']),
})

const profile = computed<any>(() => data.value?.profile ?? null)

const stageLabels: Record<string, string> = {
  candidate_added: 'Candidate Added',
  resume_received: 'Resume Received',
  resume_reviewed: 'Resume Assessed',
  recruiter_screening_pending: 'Recruiter Screening In Progress',
  recruiter_screening_completed: 'Recruiter Screening Completed',
  hiring_manager_round_pending: 'Hiring Manager Round Pending',
  hiring_manager_round_completed: 'Hiring Manager Round Completed',
  hod_round_pending: 'HOD Round Pending',
  hod_round_completed: 'HOD Round Completed',
  hr_round_pending: 'HR Round Pending',
  hr_round_completed: 'HR Round Completed',
  hold_for_comparison: 'Hold for Comparison',
  reassess: 'Reassessment Required',
  not_proceeding: 'Not Proceeding',
  offer_stage: 'Offer Stage',
  offer_accepted: 'Offer Accepted',
  offer_declined: 'Offer Declined',
  joined: 'Joined',
  closed: 'Closed',
}

const fitLabels: Record<string, string> = {
  not_yet_assessed: 'Not Yet Assessed',
  strong_fit: 'Strong Fit',
  potential_fit: 'Potential Fit',
  borderline_requires_validation: 'Borderline / Requires Validation',
  significant_gap: 'Significant Gap',
}

const screeningAvailable = computed(() => [
  'resume_reviewed',
  'recruiter_screening_pending',
  'recruiter_screening_completed',
].includes(profile.value?.lastStatus ?? ''))
</script>

<template>
  <div class="rounded-xl border border-[#CFE0ED] bg-white p-4 shadow-sm dark:border-surface-800 dark:bg-surface-900">
    <div v-if="status === 'pending'" class="py-4 text-center text-sm text-surface-400">Loading PDS assessment status…</div>
    <div v-else-if="error" class="rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">Could not load the PDS recruitment assessment.</div>
    <template v-else-if="profile">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex items-start gap-2.5">
          <div class="flex size-8 items-center justify-center rounded-lg bg-[#EAF4FB]"><BrainCircuit class="size-4 text-[#1F6FA3]" /></div>
          <div>
            <h3 class="text-sm font-semibold text-[#102A43] dark:text-white">PDS Candidate Assessment</h3>
            <p class="mt-1 max-w-xl text-xs leading-5 text-surface-500">This requirement uses the approved PDS Skill Matrix. The old generic scoring-criteria engine is not used for this recruitment workflow.</p>
          </div>
        </div>
        <NuxtLink :to="localePath(`/dashboard/recruitment/${applicationId}#recruiter-screening`)" class="inline-flex items-center gap-1.5 rounded-lg bg-[#2E86C1] px-3 py-2 text-xs font-semibold text-white">
          {{ screeningAvailable ? 'Open Recruiter Screening' : 'Open Recruitment Workflow' }} <ArrowRight class="size-3.5" />
        </NuxtLink>
      </div>

      <div class="mt-4 grid gap-3 sm:grid-cols-3">
        <div class="rounded-lg bg-surface-50 p-3 dark:bg-surface-800/60"><p class="text-[10px] font-bold uppercase tracking-wide text-surface-400">Stage</p><p class="mt-1 text-sm font-semibold text-surface-800 dark:text-surface-100">{{ stageLabels[profile.lastStatus] ?? profile.lastStatus }}</p></div>
        <div class="rounded-lg bg-surface-50 p-3 dark:bg-surface-800/60"><p class="text-[10px] font-bold uppercase tracking-wide text-surface-400">Current Fit</p><p class="mt-1 text-sm font-semibold text-surface-800 dark:text-surface-100">{{ fitLabels[profile.currentFit] ?? profile.currentFit }}</p></div>
        <div class="rounded-lg bg-surface-50 p-3 dark:bg-surface-800/60"><p class="text-[10px] font-bold uppercase tracking-wide text-surface-400">AI Match</p><p class="mt-1 text-sm font-semibold text-surface-800 dark:text-surface-100">{{ profile.provisionalFitScore != null ? `${profile.provisionalFitScore}/100` : 'Pending' }}</p></div>
      </div>

      <div class="mt-3 flex items-center gap-2 rounded-lg border border-surface-200 px-3 py-2 text-xs text-surface-500 dark:border-surface-700">
        <CheckCircle2 v-if="profile.lastStatus !== 'candidate_added'" class="size-3.5 text-[#16847F]" />
        <FileSearch v-else class="size-3.5 text-[#2E86C1]" />
        <span v-if="profile.lastStatus === 'candidate_added'">Add/select the candidate resume first, then run the PDS Skill Assessment.</span>
        <span v-else-if="profile.lastStatus === 'resume_received'">Resume is selected. Complete the PDS Skill Assessment to prepare recruiter-call questions.</span>
        <span v-else-if="profile.lastStatus === 'resume_reviewed'">Resume assessment is ready. Prepare the recruiter call and review the questions before calling.</span>
        <span v-else-if="profile.lastStatus === 'recruiter_screening_pending'">Recruiter call is in progress. Record responses and adjust unanswered questions as needed.</span>
        <span v-else>Continue the recorded PDS recruitment stage from the Recruitment Workspace.</span>
      </div>
    </template>
    <div v-else class="flex items-center gap-2 py-3 text-sm text-surface-500"><Clock3 class="size-4" />Recruitment profile is not available yet.</div>
  </div>
</template>