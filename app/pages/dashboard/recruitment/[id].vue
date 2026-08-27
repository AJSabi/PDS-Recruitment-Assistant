<script setup lang="ts">
import { ArrowLeft, Briefcase, ClipboardList, FileSearch, Target, ShieldCheck, TrendingUp, AlertTriangle, Route, Mail, Sparkles, PhoneCall } from 'lucide-vue-next'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'require-org'] })

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
const screeningActionVisible = computed(() => ['resume_reviewed', 'hold_for_comparison', 'reassess', 'recruiter_screening_pending'].includes(profile.value?.lastStatus ?? ''))
const screeningActionLabel = computed(() => profile.value?.lastStatus === 'recruiter_screening_pending' ? 'Continue Recruiter Screening' : profile.value?.lastStatus === 'reassess' ? 'Revalidate Candidate' : 'Start Recruiter Screening')

const stageLabels: Record<string, string> = {
  candidate_added: 'Candidate Added', resume_received: 'Resume Received', resume_reviewed: 'Ready for Recruiter Screening', recruiter_screening_pending: 'Recruiter Screening Pending', recruiter_screening_completed: 'Recruiter Screening Completed', hiring_manager_round_pending: 'Hiring Manager Round Pending', hiring_manager_round_completed: 'Hiring Manager Round Completed', hod_round_pending: 'HOD Pending', hod_round_completed: 'HOD Completed', hr_round_pending: 'HR Pending', hr_round_completed: 'HR Completed', hold_for_comparison: 'Hold for Comparison', reassess: 'Reassessment Required', not_proceeding: 'Not Proceeding', offer_stage: 'Offer Stage', offer_accepted: 'Offer Accepted', offer_declined: 'Offer Declined', joined: 'Joined', closed: 'Closed',
}
const fitLabels: Record<string, string> = {
  not_yet_assessed: 'Not Yet Assessed', strong_fit: 'Strong Fit', potential_fit: 'Potential Fit', borderline_requires_validation: 'Borderline / Requires Validation', significant_gap: 'Significant Gap',
}
function scoreClass(score?: number | null) {
  if ((score ?? 0) >= 85) return 'bg-[#E9F8F6] border-[#B8E2DE] text-[#13756F]'
  if ((score ?? 0) >= 70) return 'bg-[#EAF4FB] border-[#BED9E9] text-[#1F6FA3]'
  if ((score ?? 0) >= 60) return 'bg-[#FFF7E8] border-[#E8D7B4] text-[#976511]'
  return 'bg-surface-100 border-surface-200 text-surface-700 dark:bg-surface-800 dark:border-surface-700 dark:text-surface-300'
}

async function refreshWorkflow() { await Promise.all([refreshApplication(), refreshProfile()]) }
function openRecruiterScreening() {
  document.getElementById('recruiter-screening')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

useSeoMeta({
  title: computed(() => application.value ? `Recruitment — ${application.value.candidate.firstName} ${application.value.candidate.lastName}` : 'Recruitment Application'),
})
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6">
    <div class="flex flex-wrap items-center gap-2">
      <NuxtLink v-if="application?.job.id" :to="localePath(`/dashboard/jobs/${application.job.id}/pds-ranking`)" class="inline-flex items-center gap-1.5 rounded-lg border border-surface-300 px-3 py-1.5 text-sm font-medium text-surface-600 hover:border-brand-400 hover:text-brand-700 dark:border-surface-700 dark:text-surface-300"><ArrowLeft class="size-4" />AI Candidate Pool</NuxtLink>
      <NuxtLink v-if="application?.job.id" :to="localePath(`/dashboard/jobs/${application.job.id}/ai-analysis`)" class="inline-flex items-center gap-1.5 rounded-lg border border-surface-300 px-3 py-1.5 text-sm font-medium text-surface-600 hover:border-brand-400 hover:text-brand-700 dark:border-surface-700 dark:text-surface-300"><FileSearch class="size-4" />JD & Skill Matrix</NuxtLink>
      <NuxtLink v-if="application?.job.id" :to="localePath(`/dashboard/jobs/${application.job.id}/pds-register`)" class="inline-flex items-center gap-1.5 rounded-lg border border-surface-300 px-3 py-1.5 text-sm font-medium text-surface-600 hover:border-brand-400 hover:text-brand-700 dark:border-surface-700 dark:text-surface-300"><ClipboardList class="size-4" />Candidate Register</NuxtLink>
    </div>

    <div v-if="status === 'pending'" class="py-12 text-center text-surface-400">Loading recruitment workspace…</div>
    <div v-else-if="error" class="rounded-xl border border-danger-200 bg-danger-50 p-4 text-danger-700">Failed to load recruitment workspace.</div>

    <template v-else-if="application">
      <section class="overflow-hidden rounded-3xl bg-[#102A43] text-white shadow-sm">
        <div class="px-6 py-6 sm:px-8">
          <div class="flex flex-wrap items-start justify-between gap-5">
            <div class="min-w-0">
              <p class="text-xs font-semibold uppercase tracking-[0.18em] text-[#9FD3F2]">Recruiter Workspace</p>
              <h1 class="mt-2 text-3xl font-bold tracking-tight">{{ application.candidate.firstName }} {{ application.candidate.lastName }}</h1>
              <div class="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[#D5E6F3]"><span class="inline-flex items-center gap-1.5"><Briefcase class="size-4" />{{ application.job.title }}</span><span class="inline-flex items-center gap-1.5"><Mail class="size-4" />{{ application.candidate.email }}</span></div>
            </div>
            <div v-if="profile?.provisionalFitScore != null" class="rounded-2xl border px-5 py-4 text-center" :class="scoreClass(profile.provisionalFitScore)"><p class="text-[10px] font-bold uppercase tracking-wide">AI Resume Match</p><p class="mt-1 text-3xl font-black">{{ profile.provisionalFitScore }}%</p><p class="text-sm font-bold">{{ profile.priority ?? '—' }}</p></div>
          </div>

          <div v-if="profile" class="mt-6 grid gap-3 md:grid-cols-[1fr_1fr_1fr_1.35fr]">
            <div class="rounded-2xl border border-white/10 bg-white/5 p-4"><p class="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[#9FD3F2]"><Route class="size-3" />Current Stage</p><p class="mt-2 text-sm font-semibold">{{ stageLabels[profile.lastStatus] ?? profile.lastStatus }}</p></div>
            <div class="rounded-2xl border border-white/10 bg-white/5 p-4"><p class="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[#9FD3F2]"><ShieldCheck class="size-3" />Current Fit</p><p class="mt-2 text-sm font-semibold">{{ fitLabels[profile.currentFit] ?? profile.currentFit }}</p></div>
            <div class="rounded-2xl border border-white/10 bg-white/5 p-4"><p class="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[#9FD3F2]"><TrendingUp class="size-3" />Key Strength</p><p class="mt-2 text-sm font-semibold">{{ profile.keyStrength || 'Not assessed yet' }}</p></div>
            <div class="rounded-2xl border border-[#52B7D8]/30 bg-[#2E86C1]/20 p-4"><p class="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[#CDEEFF]"><Target class="size-3" />Next Action</p><p class="mt-2 text-sm font-bold text-white">{{ profile.nextAction || 'Review candidate' }}</p><button v-if="screeningActionVisible" type="button" data-testid="start-recruiter-screening" class="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#16847F] px-3 py-2 text-xs font-bold text-white shadow-sm" @click="openRecruiterScreening"><PhoneCall class="size-3.5" />{{ screeningActionLabel }}</button></div>
          </div>
        </div>
      </section>

      <section v-if="profile" class="grid gap-4 lg:grid-cols-2">
        <div class="rounded-2xl border border-[#D7E9E7] bg-white p-5 shadow-sm dark:border-surface-800 dark:bg-surface-900"><div class="flex items-center gap-2"><TrendingUp class="size-5 text-[#16847F]" /><h2 class="font-bold text-[#102A43] dark:text-white">What supports the fit</h2></div><p class="mt-3 text-sm leading-6 text-surface-700 dark:text-surface-200">{{ profile.keyStrength || 'AI assessment has not yet identified a primary strength.' }}</p></div>
        <div class="rounded-2xl border border-[#E8D7B4] bg-white p-5 shadow-sm dark:border-surface-800 dark:bg-surface-900"><div class="flex items-center gap-2"><AlertTriangle class="size-5 text-[#976511]" /><h2 class="font-bold text-[#102A43] dark:text-white">What needs validation</h2></div><p class="mt-3 text-sm leading-6 text-surface-700 dark:text-surface-200">{{ profile.mainGap || 'No material gap is currently recorded.' }}</p></div>
      </section>

      <PdsCandidateSummary :application-id="applicationId" />
      <div class="rounded-xl border border-[#CFE0ED] bg-[#F7FBFE] px-4 py-3 text-xs text-[#486581] dark:border-surface-800 dark:bg-surface-900 dark:text-surface-400"><Sparkles class="mr-1 inline size-3.5" />Recruiter ownership follows the requirement allocation. Reassignment is managed centrally from Requirement Allocations.</div>

      <div class="space-y-6">
        <PdsResumeAssessmentPanel :application-id="applicationId" :selected-resume-document-id="profile?.selectedResumeDocumentId" :recruitment-status="profile?.lastStatus" @saved="refreshWorkflow" />
        <PdsCandidateNotInterested :application-id="applicationId" :status="profile?.lastStatus" @changed="refreshWorkflow" />
        <PdsRecruiterScreening :application-id="applicationId" :enabled="screeningEnabled" :recruitment-status="profile?.lastStatus" @changed="refreshWorkflow" />
        <PdsApplicationRecruitmentPanel :application-id="applicationId" :documents="application.candidate.documents ?? []" @changed="refreshWorkflow" />
        <PdsRecruitmentLifecycle :application-id="applicationId" :profile="profile" @changed="refreshWorkflow" />
        <PdsCandidateHistory :application-id="applicationId" />
      </div>
    </template>
  </div>
</template>
