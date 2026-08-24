<script setup lang="ts">
import { ArrowLeft, Briefcase, UserRound } from 'lucide-vue-next'

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
    <NuxtLink :to="localePath(`/dashboard/applications/${applicationId}`)" class="mb-4 inline-flex items-center gap-1 text-sm font-medium text-surface-500 hover:text-brand-600">
      <ArrowLeft class="size-4" />
      Back to Application
    </NuxtLink>

    <div v-if="status === 'pending'" class="py-12 text-center text-surface-400">Loading application…</div>
    <div v-else-if="error" class="rounded-lg border border-danger-200 bg-danger-50 p-4 text-danger-700">Failed to load application.</div>

    <template v-else-if="application">
      <header class="mb-6 rounded-xl border border-surface-200 bg-white p-5 dark:border-surface-800 dark:bg-surface-900">
        <p class="text-xs font-medium uppercase tracking-wide text-surface-400">PDS Recruitment Application</p>
        <h1 class="mt-1 text-2xl font-bold text-surface-900 dark:text-surface-50">{{ application.candidate.firstName }} {{ application.candidate.lastName }}</h1>
        <div class="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-surface-500">
          <span class="inline-flex items-center gap-1.5"><Briefcase class="size-4" />{{ application.job.title }}</span>
          <span class="inline-flex items-center gap-1.5"><UserRound class="size-4" />{{ application.candidate.email }}</span>
        </div>
      </header>

      <div class="space-y-6">
        <PdsApplicationRecruitmentPanel
          :application-id="applicationId"
          :documents="application.candidate.documents ?? []"
          @changed="refreshWorkflow"
        />

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

        <PdsCandidateHistory :application-id="applicationId" />
      </div>
    </template>
  </div>
</template>
