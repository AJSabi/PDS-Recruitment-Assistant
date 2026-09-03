<script setup lang="ts">
import {
  Calendar, Download, ExternalLink, FileText, Mail, MessageSquare,
  Phone, Upload, UserRound, X,
} from '@lucide/vue'
import { usePreviewReadOnly } from '~/composables/usePreviewReadOnly'

const props = defineProps<{
  applicationId: string
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'updated'): void
}>()

const toast = useToast()
const { handlePreviewReadOnlyError } = usePreviewReadOnly()
const { formatCandidateName } = useOrgSettings()

const activeTab = ref<'workspace' | 'screening' | 'interviews' | 'documents' | 'history'>('workspace')
const showScheduleSidebar = ref(false)

const { data: application, status: applicationStatus, refresh: refreshApplication } = useFetch(
  () => `/api/applications/${props.applicationId}`,
  {
    key: computed(() => `pds-workspace-application-${props.applicationId}`),
    headers: useRequestHeaders(['cookie']),
    watch: [() => props.applicationId],
  },
)

const { data: profileData, status: profileStatus, refresh: refreshProfile } = useFetch(
  () => `/api/applications/${props.applicationId}/recruitment-profile`,
  {
    key: computed(() => `pds-workspace-profile-${props.applicationId}`),
    headers: useRequestHeaders(['cookie']),
    watch: [() => props.applicationId],
  },
)

const profile = computed<any>(() => profileData.value?.profile ?? null)
const documents = computed(() => application.value?.candidate?.documents ?? [])
const isLoading = computed(() => applicationStatus.value === 'pending' || profileStatus.value === 'pending')

const stageLabels: Record<string, string> = {
  candidate_added: 'Candidate Added',
  resume_received: 'Resume Received',
  resume_reviewed: 'Resume Reviewed',
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

const fitLabels: Record<string, string> = {
  not_yet_assessed: 'Not Yet Assessed',
  strong_fit: 'Strong Fit',
  potential_fit: 'Potential Fit',
  borderline_requires_validation: 'Borderline / Requires Validation',
  significant_gap: 'Significant Gap',
}

const screeningEnabled = computed(() => {
  const stage = profile.value?.lastStatus ?? ''
  return Boolean(profile.value?.selectedResumeDocumentId)
    && !['candidate_added', 'resume_received'].includes(stage)
})

async function refreshWorkspace() {
  await Promise.all([refreshApplication(), refreshProfile()])
  emit('updated')
}

watch(() => props.applicationId, () => {
  activeTab.value = 'workspace'
  showScheduleSidebar.value = false
})

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.open && !showScheduleSidebar.value) emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

// Notes remain application notes; recruitment stage movement is handled only by
// PdsRecruitmentLifecycle and never through the legacy application status field.
const editingNotes = ref(false)
const notesInput = ref('')
const savingNotes = ref(false)

function editNotes() {
  notesInput.value = application.value?.notes ?? ''
  editingNotes.value = true
}

async function saveNotes() {
  savingNotes.value = true
  try {
    await $fetch(`/api/applications/${props.applicationId}`, {
      method: 'PATCH',
      body: { notes: notesInput.value.trim() || null },
    })
    editingNotes.value = false
    await refreshWorkspace()
  } catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    toast.error('Could not save recruiter notes', { message: err?.data?.statusMessage ?? err?.message })
  } finally {
    savingNotes.value = false
  }
}

// Documents are candidate-level history. New uploads are added as additional
// documents; earlier resumes remain preserved unless explicitly managed elsewhere.
const { uploadDocument, downloadDocument } = useDocuments()
const fileInput = ref<HTMLInputElement | null>(null)
const selectedDocType = ref<'resume' | 'cover_letter' | 'other'>('resume')
const uploading = ref(false)

function chooseFile() {
  fileInput.value?.click()
}

async function handleFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  const candidateId = application.value?.candidate?.id
  if (!file || !candidateId) return

  uploading.value = true
  try {
    await uploadDocument(candidateId, file, selectedDocType.value)
    toast.success('Document added', {
      message: selectedDocType.value === 'resume'
        ? 'The new resume was added to Candidate Documents. Earlier resumes remain preserved.'
        : 'The document was added to the candidate record.',
    })
    await refreshWorkspace()
  } catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    toast.error('Could not upload document', { message: err?.data?.statusMessage ?? err?.message })
  } finally {
    uploading.value = false
    input.value = ''
  }
}

async function download(docId: string) {
  try {
    await downloadDocument(docId)
  } catch {
    toast.error('Could not download document')
  }
}

const { interviews } = useInterviews({
  applicationId: computed(() => props.applicationId),
})

function interviewDate(value: string) {
  return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <Transition name="pds-workspace-slide">
    <aside
      v-if="open"
      class="fixed right-0 top-14 z-40 flex h-[calc(100vh-3.5rem)] w-full flex-col border-l border-surface-200 bg-surface-50 shadow-2xl dark:border-surface-800 dark:bg-surface-950 sm:w-[820px] sm:max-w-[calc(100vw-3rem)]"
      data-testid="pds-recruiter-candidate-workspace"
    >
      <header class="shrink-0 border-b border-surface-200 bg-white px-5 py-4 dark:border-surface-800 dark:bg-surface-900">
        <div class="flex items-start justify-between gap-4">
          <div v-if="application" class="min-w-0 flex-1">
            <div class="flex items-start gap-3">
              <div class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#EAF4FA] text-sm font-bold text-[#1F6FA3] dark:bg-surface-800 dark:text-brand-300">
                <UserRound class="size-5" />
              </div>
              <div class="min-w-0">
                <h2 class="truncate text-lg font-bold text-[#102A43] dark:text-white">{{ formatCandidateName(application.candidate) }}</h2>
                <p class="mt-0.5 truncate text-sm font-medium text-surface-500">{{ application.job?.title }}</p>
                <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-surface-500">
                  <a :href="`mailto:${application.candidate.email}`" class="inline-flex items-center gap-1 hover:text-brand-600"><Mail class="size-3.5" />{{ application.candidate.email }}</a>
                  <span v-if="application.candidate.phone" class="inline-flex items-center gap-1"><Phone class="size-3.5" />{{ application.candidate.phone }}</span>
                </div>
              </div>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <button v-if="application" type="button" class="inline-flex items-center gap-1.5 rounded-lg border border-surface-300 bg-white px-3 py-2 text-xs font-semibold text-surface-700 hover:border-brand-300 hover:text-brand-700 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-200" @click="showScheduleSidebar = true">
              <Calendar class="size-3.5" />Schedule Interview
            </button>
            <button type="button" class="rounded-lg p-2 text-surface-400 hover:bg-surface-100 hover:text-surface-700 dark:hover:bg-surface-800" title="Close" @click="emit('close')"><X class="size-5" /></button>
          </div>
        </div>

        <div v-if="profile" class="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_2fr]" data-testid="pds-workspace-recruitment-state">
          <div class="rounded-xl bg-[#102A43] px-3 py-2.5 text-white">
            <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/60">Current Stage</p>
            <p class="mt-1 text-xs font-semibold">{{ stageLabels[profile.lastStatus] ?? profile.lastStatus }}</p>
          </div>
          <div class="rounded-xl bg-brand-50 px-3 py-2.5 dark:bg-brand-950/30">
            <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-600">Current Fit</p>
            <p class="mt-1 text-xs font-semibold text-brand-800 dark:text-brand-200">{{ fitLabels[profile.currentFit] ?? profile.currentFit }}</p>
          </div>
          <div class="rounded-xl border border-accent-200 bg-accent-50/70 px-3 py-2.5 dark:border-accent-900 dark:bg-accent-950/20">
            <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-accent-700">Recruiter Next Action</p>
            <p class="mt-1 text-xs font-semibold text-surface-800 dark:text-surface-100">{{ profile.nextAction || 'Review current recruitment evidence.' }}</p>
          </div>
        </div>
      </header>

      <nav class="shrink-0 overflow-x-auto border-b border-surface-200 bg-white px-5 dark:border-surface-800 dark:bg-surface-900">
        <div class="flex min-w-max gap-1">
          <button v-for="tab in ([
            ['workspace', 'Workspace'],
            ['screening', 'Recruiter Screening'],
            ['interviews', 'Interviews'],
            ['documents', `Documents (${documents.length})`],
            ['history', 'Journey'],
          ] as const)" :key="tab[0]" type="button" class="border-b-2 px-3 py-3 text-xs font-semibold transition-colors" :class="activeTab === tab[0] ? 'border-brand-600 text-brand-700 dark:text-brand-300' : 'border-transparent text-surface-500 hover:text-surface-800 dark:hover:text-surface-200'" @click="activeTab = tab[0]">
            {{ tab[1] }}
          </button>
        </div>
      </nav>

      <main class="flex-1 overflow-y-auto p-5 sm:p-6">
        <div v-if="isLoading" class="py-16 text-center text-sm text-surface-400">Loading recruiter workspace…</div>

        <template v-else-if="application && profile">
          <div v-if="activeTab === 'workspace'" class="space-y-5">
            <PdsApplicationRecruitmentPanel :application-id="props.applicationId" :documents="documents" @changed="refreshWorkspace" />
            <PdsCandidateSummary :application-id="props.applicationId" />
            <PdsRecruitmentLifecycle :application-id="props.applicationId" :profile="profile" @changed="refreshWorkspace" />

            <section class="rounded-xl border border-surface-200 bg-white p-5 dark:border-surface-800 dark:bg-surface-900">
              <div class="flex items-center justify-between gap-3">
                <div><h3 class="flex items-center gap-2 text-sm font-semibold text-surface-800 dark:text-surface-100"><MessageSquare class="size-4 text-brand-600" />Recruiter Notes</h3><p class="mt-1 text-xs text-surface-500">Working notes for this application. Recruitment stage decisions remain in the governed workflow above.</p></div>
                <button v-if="!editingNotes" type="button" class="text-xs font-semibold text-brand-700 hover:text-brand-800 dark:text-brand-300" @click="editNotes">{{ application.notes ? 'Edit' : 'Add notes' }}</button>
              </div>
              <div v-if="editingNotes" class="mt-4">
                <textarea v-model="notesInput" rows="4" class="w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800" placeholder="Recruiter notes" />
                <div class="mt-2 flex justify-end gap-2"><button type="button" class="rounded-lg border border-surface-300 px-3 py-1.5 text-xs font-semibold" @click="editingNotes = false">Cancel</button><button type="button" :disabled="savingNotes" class="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50" @click="saveNotes">{{ savingNotes ? 'Saving…' : 'Save notes' }}</button></div>
              </div>
              <p v-else-if="application.notes" class="mt-4 whitespace-pre-wrap text-sm leading-6 text-surface-700 dark:text-surface-200">{{ application.notes }}</p>
              <p v-else class="mt-4 text-sm italic text-surface-400">No recruiter notes recorded.</p>
            </section>
          </div>

          <div v-else-if="activeTab === 'screening'" class="space-y-5">
            <PdsRecruiterScreening :application-id="props.applicationId" :enabled="screeningEnabled" :recruitment-status="profile.lastStatus" @changed="refreshWorkspace" />
          </div>

          <div v-else-if="activeTab === 'interviews'" class="space-y-5">
            <section class="rounded-xl border border-surface-200 bg-white p-5 dark:border-surface-800 dark:bg-surface-900">
              <div class="flex items-center justify-between gap-3"><div><h3 class="text-sm font-semibold text-surface-800 dark:text-surface-100">Scheduled Interviews</h3><p class="mt-1 text-xs text-surface-500">Interview schedule for this application.</p></div><button type="button" class="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white" @click="showScheduleSidebar = true"><Calendar class="size-3.5" />Schedule</button></div>
              <div v-if="interviews.length" class="mt-4 space-y-2">
                <div v-for="interview in interviews" :key="interview.id" class="rounded-lg border border-surface-200 p-3 dark:border-surface-700">
                  <div class="flex items-center justify-between gap-3"><NuxtLink :to="$localePath(`/dashboard/interviews/${interview.id}`)" class="truncate text-sm font-semibold text-surface-800 hover:text-brand-600 dark:text-surface-100">{{ interview.title }}</NuxtLink><span class="rounded-full bg-surface-100 px-2 py-0.5 text-[10px] font-semibold capitalize text-surface-600 dark:bg-surface-800 dark:text-surface-300">{{ interview.status === 'no_show' ? 'No show' : interview.status }}</span></div>
                  <p class="mt-1 text-xs text-surface-500">{{ interviewDate(interview.scheduledAt) }} · {{ interview.duration }} min · {{ interview.type.replaceAll('_', ' ') }}</p>
                </div>
              </div>
              <p v-else class="mt-4 rounded-lg border border-dashed border-surface-300 p-4 text-sm text-surface-500 dark:border-surface-700">No interview scheduled yet.</p>
            </section>
            <PdsInterviewEvidence :application-id="props.applicationId" :status="profile.lastStatus" @changed="refreshWorkspace" />
          </div>

          <div v-else-if="activeTab === 'documents'" class="space-y-4">
            <input ref="fileInput" type="file" accept=".pdf,.doc,.docx" class="hidden" @change="handleFileSelected" />
            <section class="rounded-xl border border-surface-200 bg-white p-5 dark:border-surface-800 dark:bg-surface-900">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div><h3 class="text-sm font-semibold text-surface-800 dark:text-surface-100">Candidate Documents</h3><p class="mt-1 max-w-xl text-xs text-surface-500">Upload a newer resume as an additional document. Earlier resumes remain preserved as point-in-time candidate history.</p></div>
                <div class="flex items-center gap-2"><select v-model="selectedDocType" class="rounded-lg border border-surface-300 bg-white px-2.5 py-2 text-xs dark:border-surface-700 dark:bg-surface-800"><option value="resume">Resume</option><option value="cover_letter">Cover Letter</option><option value="other">Other</option></select><button type="button" :disabled="uploading" class="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" @click="chooseFile"><Upload class="size-3.5" />{{ uploading ? 'Uploading…' : 'Add document' }}</button></div>
              </div>
              <div v-if="documents.length" class="mt-4 space-y-2">
                <div v-for="doc in documents" :key="doc.id" class="flex items-center justify-between gap-3 rounded-lg border border-surface-200 px-3 py-3 dark:border-surface-700">
                  <div class="flex min-w-0 items-center gap-2.5"><FileText class="size-4 shrink-0 text-surface-400" /><div class="min-w-0"><p class="truncate text-sm font-medium text-surface-800 dark:text-surface-100">{{ doc.originalFilename }}</p><p class="mt-0.5 text-xs capitalize text-surface-400">{{ doc.type.replaceAll('_', ' ') }} · {{ new Date(doc.createdAt).toLocaleDateString() }}</p></div></div>
                  <button type="button" class="rounded-lg p-2 text-surface-400 hover:bg-surface-100 hover:text-brand-600 dark:hover:bg-surface-800" title="Download" @click="download(doc.id)"><Download class="size-4" /></button>
                </div>
              </div>
              <p v-else class="mt-4 rounded-lg border border-dashed border-surface-300 p-4 text-sm text-surface-500 dark:border-surface-700">No candidate documents available.</p>
            </section>
            <NuxtLink :to="$localePath(`/dashboard/candidates/${application.candidate.id}`)" class="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 dark:text-brand-300"><ExternalLink class="size-3.5" />Open full candidate profile</NuxtLink>
          </div>

          <div v-else-if="activeTab === 'history'">
            <PdsCandidateHistory :application-id="props.applicationId" />
          </div>
        </template>
      </main>
    </aside>
  </Transition>

  <InterviewScheduleSidebar
    v-if="showScheduleSidebar && application"
    :application-id="props.applicationId"
    :candidate-name="`${application.candidate.firstName} ${application.candidate.lastName}`.trim()"
    :job-title="application.job?.title ?? ''"
    @close="showScheduleSidebar = false"
    @scheduled="showScheduleSidebar = false"
  />
</template>

<style scoped>
.pds-workspace-slide-enter-active,
.pds-workspace-slide-leave-active { transition: transform 0.2s ease; }
.pds-workspace-slide-enter-from,
.pds-workspace-slide-leave-to { transform: translateX(100%); }
</style>
