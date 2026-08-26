<script setup lang="ts">
import { ArrowLeft, Briefcase, ClipboardList, FileSearch, Target, UserRound } from 'lucide-vue-next'

definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'require-org'],
})

const route = useRoute()
const applicationId = route.params.id as string
const localePath = useLocalePath()

const { application, status, error, refresh: refreshApplication } = useApplication(applicationId)
const { data: profileData, refresh: refreshProfile } = useFetch(() => `/api/applications/${applicationId}/recruitment-profile`, {
  key: `pds-recruitment-page-profile-${applicationId}`,
  headers: useRequestHeaders(['cookie']),
})

const profile = computed<any>(() => profileData.value?.profile ?? null)
const screeningEnabled = computed(() => ['resume_reviewed', 'hold_for_comparison', 'reassess', 'recruiter_screening_pending'].includes(profile.value?.lastStatus ?? ''))

const stageLabels: Record<string, string> = {
  candidate_added: 'Candidate Added',
  resume_received: 'Resume Received',
  resume_reviewed: 'Ready for Recruiter Screening',
  recruiter_screening_pending: 'Recruiter Screening Pending',
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

async function refreshWorkflow() {
  await Promise.all([refreshApplication(), refreshProfile()])
}

useSeoMeta({
  title: computed(() => application.value
    ? `Recruitment — ${application.value.candidate.firstName} ${application.value.candidate.lastName}`
    : 'Recruitment Application'),
})
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <NuxtLink
        v-if="application?.job.id"
        :to="localePath(`/dashboard/jobs/${application.job.id}/pds-ranking`)"
        class="inline-flex items-center gap-1.5 rounded-lg border border-surface-300 px-3 py-1.5 text-sm font-medium text-surface-600 hover:border-brand-400 hover:text-brand-700 dark:border-surface-700 dark:text-surface-300"
      >
        <ArrowLeft class="size-4" />
        AI Candidate Pool
      </NuxtLink>
      <NuxtLink
        v-if="application?.job.id"
        :to="localePath(`/dashboard/jobs/${application.job.id}/ai-analysis`)"
        class="inline-flex items-center gap-1.5 rounded-lg border border-surface-300 px-3 py-1.5 text-sm font-medium text-surface-600 hover:border-brand-400 hover:text-brand-700 dark:border-surface-700 dark:text-surface-300"
      >
        <FileSearch class="size-4" />
        JD & Skill Matrix
      </NuxtLink>
      <NuxtLink
        v-if="application?.job.id"
        :to="localePath(`/dashboard/jobs/${application.job.id}/pds-register`)"
        class="inline-flex items-center gap-1.5 rounded-lg border border-surface-300 px-3 py-1.5 text-sm font-medium text-surface-600 hover:border-brand-400 hover:text-brand-700 dark:border-surface-700 dark:text-surface-300"
      >
        <ClipboardList class="size-4" />
        Candidate Register
      </NuxtLink>
    </div>

    <div v-if="status === 'pending'" class="py-12 text-center text-surface-400">Loading recruitment workspace…</div>
    <div v-else-if="error" class="rounded-lg border border-danger-200 bg-danger-50 p-4 text-danger-700">Failed to load recruitment workspace.</div>

    <template v-else-if="application">
      <header class="mb-6 rounded-xl border border-surface-200 bg-white p-5 dark:border-surface-800 dark:bg-surface-900">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p class="text-xs font-medium uppercase tracking-wide text-brand-600">Recruiter Workspace</p>
            <h1 class="mt-1 text-2xl font-bold text-surface-900 dark:text-surface-50">{{ application.candidate.firstName }} {{ application.candidate.lastName }}</h1>
            <div class="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-surface-500">
              <span class="inline-flex items-center gap-1.5"><Briefcase class="size-4" />{{ application.job.title }}</span>
              <span class="inline-flex items-center gap-1.5"><UserRound class="size-4" />{{ application.candidate.email }}</span>
            </div>
          </div>
          <div v-if="profile?.provisionalFitScore != null" class="rounded-xl bg-brand-50 px-4 py-3 text-center dark:bg-brand-950/30">
            <p class="text-[11px] font-medium uppercase tracking-wide text-brand-600">AI Resume Match</p>
            <p class="mt-1 text-2xl font-bold text-brand-700 dark:text-brand-300">{{ profile.provisionalFitScore }}%</p>
            <p class="text-xs font-semibold text-brand-600">{{ profile.priority ?? '—' }}</p>
          </div>
        </div>

        <div v-if="profile" class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div class="rounded-lg bg-surface-50 p-3 dark:bg-surface-800/60"><p class="text-[11px] uppercase tracking-wide text-surface-400">Stage</p><p class="mt-1 text-sm font-semibold">{{ stageLabels[profile.lastStatus] ?? profile.lastStatus }}</p></div>
          <div class="rounded-lg bg-surface-50 p-3 dark:bg-surface-800/60"><p class="text-[11px] uppercase tracking-wide text-surface-400">Key Strength</p><p class="mt-1 text-sm font-medium">{{ profile.keyStrength || '—' }}</p></div>
          <div class="rounded-lg bg-surface-50 p-3 dark:bg-surface-800/60"><p class="text-[11px] uppercase tracking-wide text-surface-400">Main Gap</p><p class="mt-1 text-sm font-medium">{{ profile.mainGap || '—' }}</p></div>
          <div class="rounded-lg bg-brand-50 p-3 dark:bg-brand-950/30"><p class="flex items-center gap-1 text-[11px] uppercase tracking-wide text-brand-600"><Target class="size-3" />Next Action</p><p class="mt-1 text-sm font-semibold text-brand-700 dark:text-brand-300">{{ profile.nextAction || 'Review candidate' }}</p></div>
        </div>

        <p class="mt-4 text-xs text-surface-400">Recruiter ownership follows the requirement allocation. Reassign the requirement from Allocation Management rather than changing candidates individually.</p>
      </header>

      <div class="space-y-6">
        <PdsResumeAssessmentPanel
          :application-id="applicationId"
          :selected-resume-document-id="profile?.selectedResumeDocumentId"
          :recruitment-status="profile?.lastStatus"
          @saved="refreshWorkflow"
        />

        <PdsRecruiterScreening
          :application-id="applicationId"
          :enabled="screeningEnabled"
          @changed="refreshWorkflow"
        />

        <PdsApplicationRecruitmentPanel
          :application-id="applicationId"
          :documents="application.candidate.documents ?? []"
          @changed="refreshWorkflow"
        />

        <PdsInterviewEvidence
          :application-id="applicationId"
          :status="profile?.lastStatus"
          @changed="refreshWorkflow"
        />

        <PdsRecruitmentLifecycle
          :application-id="applicationId"
          :profile="profile"
          @changed="refreshWorkflow"
        />

        <PdsCandidateHistory :application-id="applicationId" />
      </div>
    </template>
  </div>
</template>
