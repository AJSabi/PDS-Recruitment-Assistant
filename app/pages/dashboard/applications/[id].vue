<script setup lang="ts">
import { ArrowLeft, Briefcase, FileText, Mail, Phone, PhoneCall, User } from 'lucide-vue-next'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'require-org'] })

const route = useRoute()
const applicationId = route.params.id as string
const localePath = useLocalePath()
const { application, status: fetchStatus, error, refresh } = useApplication(applicationId)
const { formatCandidateName } = useOrgSettings()

const { data: recruitmentData, refresh: refreshRecruitment } = useFetch(() => `/api/applications/${applicationId}/recruitment-profile`, {
  key: computed(() => `application-recruitment-profile-${applicationId}`),
  headers: useRequestHeaders(['cookie']),
})

const profile = computed<any>(() => recruitmentData.value?.profile ?? null)
const candidateDocuments = computed<any[]>(() => application.value?.candidate?.documents ?? [])
const screeningEnabled = computed(() => [
  'resume_reviewed',
  'recruiter_screening_pending',
  'recruiter_screening_completed',
].includes(profile.value?.lastStatus ?? ''))

useSeoMeta({
  title: computed(() => application.value
    ? `${application.value.candidate.firstName} ${application.value.candidate.lastName} → ${application.value.job.title}`
    : 'Recruitment Application'),
})

async function refreshWorkflow() {
  await Promise.all([refresh(), refreshRecruitment()])
}

function openRecruiterScreening() {
  document.getElementById('recruiter-screening')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-5 pb-12">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <NuxtLink :to="localePath('/dashboard/applications')" class="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm font-medium text-surface-600 hover:bg-surface-50 dark:border-surface-800 dark:bg-surface-900 dark:text-surface-300">
        <ArrowLeft class="size-4" />Back to Pipeline
      </NuxtLink>
      <NuxtLink v-if="application" :to="localePath(`/dashboard/jobs/${application.job.id}`)" class="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline dark:text-brand-400"><Briefcase class="size-4" />Open Requirement</NuxtLink>
    </div>

    <div v-if="fetchStatus === 'pending'" class="rounded-xl border border-surface-200 bg-white py-12 text-center text-surface-400 dark:border-surface-800 dark:bg-surface-900">Loading recruitment application…</div>
    <div v-else-if="error" class="rounded-xl border border-danger-200 bg-danger-50 p-5 text-sm text-danger-700">{{ error.statusCode === 404 ? 'Application not found.' : 'Failed to load application.' }}</div>

    <template v-else-if="application">
      <section class="rounded-2xl border border-[#CFE0ED] bg-white p-5 shadow-sm dark:border-surface-800 dark:bg-surface-900">
        <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div class="flex min-w-0 items-start gap-3">
            <div class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#EAF4FB]"><User class="size-5 text-[#1F6FA3]" /></div>
            <div class="min-w-0">
              <p class="text-xs font-bold uppercase tracking-wide text-surface-400">Recruitment Workspace</p>
              <h1 class="mt-1 truncate text-2xl font-bold text-[#102A43] dark:text-white">{{ formatCandidateName(application.candidate) }}</h1>
              <p class="mt-1 text-sm text-surface-500">{{ application.job.title }}</p>
              <div class="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
                <a :href="`mailto:${application.candidate.email}`" class="inline-flex items-center gap-1.5 text-brand-600 hover:underline"><Mail class="size-4" />{{ application.candidate.email }}</a>
                <a v-if="application.candidate.phone" :href="`tel:${application.candidate.phone}`" class="inline-flex items-center gap-1.5 font-semibold text-[#16847F] hover:underline"><Phone class="size-4" />{{ application.candidate.phone }}</a>
              </div>
            </div>
          </div>

          <div class="flex flex-wrap gap-2">
            <a v-if="application.candidate.phone" :href="`tel:${application.candidate.phone}`" class="inline-flex items-center gap-2 rounded-lg bg-[#16847F] px-4 py-2 text-sm font-semibold text-white"><PhoneCall class="size-4" />Call Candidate</a>
            <button type="button" class="inline-flex items-center gap-2 rounded-lg bg-[#2E86C1] px-4 py-2 text-sm font-semibold text-white" @click="openRecruiterScreening"><FileText class="size-4" />Recruiter Screening</button>
          </div>
        </div>
        <p class="mt-4 rounded-lg bg-surface-50 px-3 py-2 text-xs leading-5 text-surface-500 dark:bg-surface-800/50">Recruiter calls are handled manually. The app prepares and records screening questions and evidence; it does not schedule the call or meeting.</p>
      </section>

      <PdsApplicationRecruitmentPanel :application-id="applicationId" :documents="candidateDocuments" @changed="refreshWorkflow" />

      <PdsResumeAssessmentPanel
        :application-id="applicationId"
        :selected-resume-document-id="profile?.selectedResumeDocumentId"
        :recruitment-status="profile?.lastStatus"
        @saved="refreshWorkflow"
      />

      <PdsRecruiterScreening :application-id="applicationId" :enabled="screeningEnabled" @changed="refreshWorkflow" />

      <template v-if="profile">
        <PdsInterviewEvidence :application-id="applicationId" :status="profile.lastStatus" @changed="refreshWorkflow" />
        <PdsRecruitmentLifecycle :application-id="applicationId" :profile="profile" @changed="refreshWorkflow" />
      </template>

      <PdsCandidateSummary :application-id="applicationId" />
    </template>
  </div>
</template>
