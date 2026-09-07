<script setup lang="ts">
import {
  X, User, Calendar, Clock, Hash, MessageSquare, FileText,
  ExternalLink, Mail, Phone, Upload, Download, Eye, Trash2,
  ArrowLeft, AlertTriangle, Brain, History, RefreshCw,
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

const { handlePreviewReadOnlyError } = usePreviewReadOnly()
const toast = useToast()
const { track } = useTrack()
const { formatCandidateName, formatDateTime } = useOrgSettings()

// Detect if the job sub-nav bar is visible (adds 40px / 2.5rem)
const route = useRoute()
const getRouteBaseName = useRouteBaseName()
const hasSubNav = computed(() => {
  const baseName = getRouteBaseName(route)
  if (typeof baseName !== 'string') return false
  const idParam = route.params.id
  return baseName.startsWith('dashboard-jobs-id') && typeof idParam === 'string' && idParam !== 'new'
})

// ─────────────────────────────────────────────
// Tabs
// ─────────────────────────────────────────────

const activeTab = ref<'overview' | 'documents' | 'responses' | 'ai_analysis' | 'timeline'>('overview')

// ─────────────────────────────────────────────
// Fetch application detail
// ─────────────────────────────────────────────

const { data: application, status: fetchStatus, refresh } = useFetch(
  () => `/api/applications/${props.applicationId}`,
  {
    key: computed(() => `sidebar-application-${props.applicationId}`),
    headers: useRequestHeaders(['cookie']),
    watch: [() => props.applicationId],
  },
)

// ─────────────────────────────────────────────
// Fetch full candidate detail (for documents)
// ─────────────────────────────────────────────

const candidateId = computed(() => application.value?.candidate?.id ?? null)

const { data: candidateData, refresh: refreshCandidate } = useFetch(
  () => candidateId.value ? `/api/candidates/${candidateId.value}` : null!,
  {
    key: computed(() => `sidebar-candidate-${candidateId.value}`),
    headers: useRequestHeaders(['cookie']),
    watch: [candidateId],
    immediate: false,
  },
)

// Fetch candidate data when application loads
watch(candidateId, (id) => {
  if (id) refreshCandidate()
}, { immediate: true })

const documents = computed(() => candidateData.value?.documents ?? [])

// ─────────────────────────────────────────────
// Status transitions
// ─────────────────────────────────────────────
import { APPLICATION_STATUS_TRANSITIONS } from '~~/shared/status-transitions'

const transitionLabels: Record<string, string> = {
  new: 'Re-open',
  screening: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
  hired: 'Hired',
  rejected: 'Reject',
}

const transitionClasses: Record<string, string> = {
  new: 'border border-surface-300 dark:border-surface-600 text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800',
  screening: 'bg-violet-600 text-white hover:bg-violet-700',
  interview: 'bg-amber-600 text-white hover:bg-amber-700',
  offer: 'bg-teal-600 text-white hover:bg-teal-700',
  hired: 'bg-green-700 text-white hover:bg-green-800',
  rejected: 'bg-danger-600 text-white hover:bg-danger-700',
}

const statusBadgeClasses: Record<string, string> = {
  new: 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/50 dark:text-blue-400 dark:ring-blue-800',
  screening: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/50 dark:text-violet-400 dark:ring-violet-800',
  interview: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:ring-amber-800',
  offer: 'bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-950/50 dark:text-teal-400 dark:ring-teal-800',
  hired: 'bg-green-50 text-green-700 ring-green-200 dark:bg-green-950/50 dark:text-green-400 dark:ring-green-800',
  rejected: 'bg-surface-100 text-surface-500 ring-surface-200 dark:bg-surface-800/50 dark:text-surface-400 dark:ring-surface-700',
}

const allowedTransitions = computed(() => {
  if (!application.value) return []
  return APPLICATION_STATUS_TRANSITIONS[application.value.status] ?? []
})

const isTransitioning = ref(false)

async function handleTransition(newStatus: string) {
  isTransitioning.value = true
  try {
    await $fetch(`/api/applications/${props.applicationId}`, {
      method: 'PATCH',
      body: { status: newStatus },
    })
    track('sidebar_status_changed', {
      application_id: props.applicationId,
      from_status: application.value?.status,
      to_status: newStatus,
    })
    await refresh()
    emit('updated')
  } catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    toast.error('Failed to update status', { message: err.data?.statusMessage, statusCode: err.data?.statusCode })
  } finally {
    isTransitioning.value = false
  }
}

// ─────────────────────────────────────────────
// Notes editing
// ─────────────────────────────────────────────

const isEditingNotes = ref(false)
const notesInput = ref('')
const isSavingNotes = ref(false)

function startEditNotes() {
  notesInput.value = application.value?.notes ?? ''
  isEditingNotes.value = true
}

async function saveNotes() {
  isSavingNotes.value = true
  try {
    await $fetch(`/api/applications/${props.applicationId}`, {
      method: 'PATCH',
      body: { notes: notesInput.value || null },
    })
    await refresh()
    emit('updated')
    isEditingNotes.value = false
  } catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    toast.error('Failed to save notes', { message: err.data?.statusMessage, statusCode: err.data?.statusCode })
  } finally {
    isSavingNotes.value = false
  }
}

// ─────────────────────────────────────────────
// Documents — upload, download, preview, delete
// ─────────────────────────────────────────────

const { uploadDocument, downloadDocument, getPreviewUrl, deleteDocument } = useDocuments()

const fileInput = ref<HTMLInputElement | null>(null)
const selectedDocType = ref<'resume' | 'cover_letter' | 'other'>('resume')
const isUploading = ref(false)
const uploadError = ref<string | null>(null)
const showDocDeleteConfirm = ref<string | null>(null)
const isDeletingDoc = ref(false)
const reparsingDocId = ref<string | null>(null)

const showPreview = ref(false)
const previewUrl = ref<string | null>(null)
const previewFilename = ref('')
const previewMimeType = ref('')
const previewDocId = ref<string | null>(null)
const isLoadingPreview = ref(false)
const previewError = ref<string | null>(null)

const isPdfPreview = computed(() => previewMimeType.value === 'application/pdf')

const documentTypeLabels: Record<string, string> = {
  resume: 'Resume',
  cover_letter: 'Cover Letter',
  other: 'Other',
}

function triggerFileSelect() {
  fileInput.value?.click()
}

async function handleFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !candidateId.value) return

  uploadError.value = null
  isUploading.value = true

  try {
    await uploadDocument(candidateId.value, file, selectedDocType.value)
    await refreshCandidate()
  } catch (err: any) {
    uploadError.value = err.data?.statusMessage ?? err.statusMessage ?? 'Upload failed'
  } finally {
    isUploading.value = false
    input.value = ''
  }
}

async function handleDownload(docId: string, filename: string) {
  await downloadDocument(docId, filename)
}

async function openPreview(docId: string, filename: string, mimeType: string) {
  previewError.value = null
  isLoadingPreview.value = true
  previewFilename.value = filename
  previewMimeType.value = mimeType
  previewDocId.value = docId
  showPreview.value = true
  try {
    previewUrl.value = await getPreviewUrl(docId)
  } catch (err: any) {
    previewError.value = err.data?.statusMessage ?? 'Preview unavailable'
  } finally {
    isLoadingPreview.value = false
  }
}

function closePreview() {
  showPreview.value = false
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = null
  previewFilename.value = ''
  previewMimeType.value = ''
  previewDocId.value = null
  previewError.value = null
  isLoadingPreview.value = false
}

async function handleDeleteDocument(docId: string) {
  isDeletingDoc.value = true
  try {
    await deleteDocument(docId)
    await refreshCandidate()
    showDocDeleteConfirm.value = null
  } catch (err: any) {
    toast.error('Failed to delete document', { message: err.data?.statusMessage, statusCode: err.data?.statusCode })
  } finally {
    isDeletingDoc.value = false
  }
}

async function reparseDocument(docId: string) {
  reparsingDocId.value = docId
  try {
    await $fetch(`/api/documents/${docId}/reparse`, { method: 'POST' })
    await refreshCandidate()
  } catch (err: any) {
    toast.error('Failed to reparse document', { message: err.data?.statusMessage, statusCode: err.data?.statusCode })
  } finally {
    reparsingDocId.value = null
  }
}

// ─────────────────────────────────────────────
// AI analysis
// ─────────────────────────────────────────────

const aiStatus = ref<'idle' | 'loading' | 'success' | 'error'>('idle')
const aiError = ref<string | null>(null)
const aiResult = ref<any>(null)

async function runAiAnalysis() {
  aiStatus.value = 'loading'
  aiError.value = null
  try {
    aiResult.value = await $fetch(`/api/applications/${props.applicationId}/score`, { method: 'POST' })
    aiStatus.value = 'success'
    await refresh()
  } catch (err: any) {
    aiError.value = err.data?.statusMessage ?? err.statusMessage ?? 'AI analysis failed'
    aiStatus.value = 'error'
  }
}

// ─────────────────────────────────────────────
// Timeline
// ─────────────────────────────────────────────

type TimelineEntry = {
  id: string
  action: string
  resourceType: string
  actorName?: string | null
  actorEmail?: string | null
  metadata?: Record<string, any> | null
  createdAt: string
}

const timelineItems = ref<TimelineEntry[]>([])
const timelineLoading = ref(false)
const timelineError = ref<string | null>(null)
const timelineLoaded = ref(false)

const timelineActionLabels: Record<string, string> = {
  created: 'Created',
  updated: 'Updated',
  deleted: 'Deleted',
  status_changed: 'Status changed',
  comment_added: 'Comment added',
  scored: 'Scored',
  scheduled: 'Scheduled',
}

function formatTimelineDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function getTimelineActionColor(action: string): string {
  switch (action) {
    case 'created': return 'bg-green-500'
    case 'status_changed': return 'bg-blue-500'
    case 'updated': return 'bg-amber-500'
    case 'deleted': return 'bg-danger-500'
    case 'comment_added': return 'bg-violet-500'
    case 'scored': return 'bg-teal-500'
    case 'scheduled': return 'bg-brand-500'
    default: return 'bg-surface-400'
  }
}

function describeTimelineItem(item: TimelineEntry): string {
  const actor = item.actorName ?? item.actorEmail ?? 'System'
  const action = timelineActionLabels[item.action] ?? item.action
  const resource = item.resourceType

  if (item.action === 'status_changed' && item.metadata) {
    const from = item.metadata.from_status ?? item.metadata.fromStatus
    const to = item.metadata.to_status ?? item.metadata.toStatus
    if (from && to) return `${actor} changed ${resource} status from ${from} to ${to}`
  }

  if (item.action === 'scored' && item.metadata) {
    const score = item.metadata.score
    if (score != null) return `${actor} scored ${resource} — ${score} pts`
  }

  return `${actor} ${action.toLowerCase()} ${resource}`
}

async function loadTimeline() {
  if (!candidateId.value) return
  timelineLoading.value = true
  timelineError.value = null
  try {
    const result = await $fetch<{ items: TimelineEntry[] }>('/api/activity-log/candidate-timeline', {
      query: { candidateId: candidateId.value },
    })
    timelineItems.value = result.items
    timelineLoaded.value = true
  } catch (err: any) {
    timelineError.value = err?.data?.statusMessage ?? 'Failed to load timeline'
  } finally {
    timelineLoading.value = false
  }
}

// Load timeline data lazily when tab is selected
watch(activeTab, (tab) => {
  if (tab === 'timeline' && !timelineLoaded.value && candidateId.value) {
    loadTimeline()
  }
})

// Reset state when switching to a different application. Clear record refs first so
// Candidate A can never remain visible while Candidate B is being fetched.
watch(() => props.applicationId, () => {
  application.value = null
  candidateData.value = null
  isEditingNotes.value = false
  activeTab.value = 'overview'
  uploadError.value = null
  showDocDeleteConfirm.value = null
  timelineItems.value = []
  timelineLoaded.value = false
  timelineError.value = null
  closePreview()
})

// ─────────────────────────────────────────────
// Display helpers
// ─────────────────────────────────────────────

function formatResponseValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value ?? '—')
}

const responsesCount = computed(() => application.value?.responses?.length ?? 0)

// ─────────────────────────────────────────────
// Interview scheduling & existing interviews
// ─────────────────────────────────────────────

const showScheduleSidebar = ref(false)

const { interviews: applicationInterviews } = useInterviews({
  applicationId: computed(() => props.applicationId),
})

const interviewTypeLabels: Record<string, string> = {
  phone: 'Phone',
  video: 'Video',
  in_person: 'In-person',
  panel: 'Panel',
  technical: 'Technical',
  take_home: 'Take-home',
}

function formatInterviewDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <Transition name="slide">
    <aside
      v-if="open"
      class="fixed right-0 z-40 w-full sm:w-[640px] sm:max-w-[calc(100vw-4rem)] border-l border-surface-200/80 dark:border-surface-800/60 bg-white dark:bg-surface-900 shadow-xl flex flex-col"
      :class="hasSubNav ? 'top-24 h-[calc(100vh-6rem)]' : 'top-14 h-[calc(100vh-3.5rem)]'"
    >
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-surface-200/80 dark:border-surface-800/60 px-4 sm:px-6 py-4 shrink-0">
        <div v-if="application" class="min-w-0 flex-1">
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center size-10 rounded-full bg-brand-50 dark:bg-brand-950 text-brand-700 dark:text-brand-400 font-semibold text-sm shrink-0">
              {{ application.candidate.firstName[0] }}{{ application.candidate.lastName[0] }}
            </div>
            <div class="min-w-0">
              <h2 class="text-lg font-semibold text-surface-900 dark:text-surface-50 truncate">
                {{ formatCandidateName(application.candidate) }}
              </h2>
              <p class="text-xs text-surface-500 dark:text-surface-400 truncate">
                {{ application.job.title }}
              </p>
            </div>
          </div>
        </div>
        <div v-else-if="fetchStatus === 'pending'" class="flex items-center gap-2 text-sm text-surface-400">
          <RefreshCw class="size-4 animate-spin" />Loading candidate…
        </div>
        <button
          type="button"
          class="ml-3 shrink-0 rounded-lg p-2 text-surface-400 hover:bg-surface-100 hover:text-surface-600 dark:hover:bg-surface-800 dark:hover:text-surface-200 transition-colors"
          aria-label="Close candidate details"
          @click="emit('close')"
        >
          <X class="size-5" />
        </button>
      </div>

      <div v-if="application" class="flex-1 overflow-y-auto">
        <div class="border-b border-surface-200 dark:border-surface-800 px-4 sm:px-6">
          <nav class="flex gap-1 overflow-x-auto" aria-label="Candidate detail tabs">
            <button v-for="tab in [
              { key: 'overview', label: 'Overview' },
              { key: 'documents', label: `Documents (${documents.length})` },
              { key: 'responses', label: `Responses (${responsesCount})` },
              { key: 'ai_analysis', label: 'AI Analysis' },
              { key: 'timeline', label: 'Timeline' },
            ]" :key="tab.key" type="button" class="shrink-0 border-b-2 px-3 py-3 text-xs font-medium transition-colors" :class="activeTab === tab.key ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400' : 'border-transparent text-surface-500 hover:text-surface-700 dark:text-surface-400 dark:hover:text-surface-200'" @click="activeTab = tab.key as typeof activeTab">
              {{ tab.label }}
            </button>
          </nav>
        </div>

        <div class="p-4 sm:p-6">
          <div v-if="activeTab === 'overview'" class="space-y-6">
            <section>
              <h3 class="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-3">Contact</h3>
              <div class="space-y-2.5 text-sm">
                <div class="flex items-center gap-2 text-surface-700 dark:text-surface-300"><Mail class="size-4 text-surface-400" />{{ application.candidate.email }}</div>
                <div v-if="application.candidate.phone" class="flex items-center gap-2 text-surface-700 dark:text-surface-300"><Phone class="size-4 text-surface-400" />{{ application.candidate.phone }}</div>
              </div>
            </section>

            <section>
              <h3 class="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-3">Application</h3>
              <dl class="grid grid-cols-2 gap-3 text-sm">
                <div><dt class="text-xs text-surface-400">Status</dt><dd class="mt-1"><span class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset capitalize" :class="statusBadgeClasses[application.status] ?? statusBadgeClasses.new">{{ application.status }}</span></dd></div>
                <div><dt class="text-xs text-surface-400">Applied</dt><dd class="mt-1 text-surface-700 dark:text-surface-300">{{ formatDateTime(application.createdAt) }}</dd></div>
              </dl>
            </section>

            <section>
              <h3 class="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-3">Notes</h3>
              <div v-if="isEditingNotes" class="space-y-2">
                <textarea v-model="notesInput" rows="4" class="w-full rounded-lg border border-surface-300 dark:border-surface-700 bg-white dark:bg-surface-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                <div class="flex gap-2"><button type="button" class="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white" :disabled="isSavingNotes" @click="saveNotes">{{ isSavingNotes ? 'Saving…' : 'Save' }}</button><button type="button" class="rounded-lg border border-surface-300 px-3 py-1.5 text-xs font-medium text-surface-600 dark:text-surface-300" @click="isEditingNotes = false">Cancel</button></div>
              </div>
              <button v-else type="button" class="w-full rounded-lg border border-dashed border-surface-300 dark:border-surface-700 px-3 py-3 text-left text-sm text-surface-500 hover:border-brand-300 hover:text-brand-600 transition-colors" @click="startEditNotes">
                <span v-if="application.notes">{{ application.notes }}</span><span v-else>Add recruiter notes…</span>
              </button>
            </section>

            <section v-if="allowedTransitions.length">
              <h3 class="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-3">Move Application</h3>
              <div class="flex flex-wrap gap-2"><button v-for="nextStatus in allowedTransitions" :key="nextStatus" type="button" :disabled="isTransitioning" class="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50" :class="transitionClasses[nextStatus] ?? transitionClasses.new" @click="handleTransition(nextStatus)">{{ transitionLabels[nextStatus] ?? nextStatus }}</button></div>
            </section>
          </div>

          <div v-else-if="activeTab === 'documents'" class="space-y-4">
            <div class="flex flex-wrap items-center gap-2">
              <select v-model="selectedDocType" class="rounded-lg border border-surface-300 dark:border-surface-700 bg-white dark:bg-surface-800 px-2.5 py-2 text-xs"><option value="resume">Resume</option><option value="cover_letter">Cover Letter</option><option value="other">Other</option></select>
              <button type="button" class="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-medium text-white" :disabled="isUploading" @click="triggerFileSelect"><Upload class="size-3.5" />{{ isUploading ? 'Uploading…' : 'Upload document' }}</button>
              <input ref="fileInput" type="file" class="hidden" accept=".pdf,.doc,.docx" @change="handleFileSelected" />
            </div>
            <p v-if="uploadError" class="text-xs text-danger-600">{{ uploadError }}</p>
            <div v-if="documents.length" class="space-y-2"><div v-for="doc in documents" :key="doc.id" class="rounded-xl border border-surface-200 dark:border-surface-700 p-3"><div class="flex items-start justify-between gap-3"><div class="min-w-0"><p class="truncate text-sm font-medium text-surface-800 dark:text-surface-100">{{ doc.originalFilename }}</p><p class="mt-0.5 text-xs text-surface-400">{{ documentTypeLabels[doc.type] ?? doc.type }} · {{ formatDateTime(doc.createdAt) }}</p></div><div class="flex shrink-0 gap-1"><button type="button" class="rounded-md p-1.5 text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800" title="Preview" @click="openPreview(doc.id, doc.originalFilename, doc.mimeType)"><Eye class="size-4" /></button><button type="button" class="rounded-md p-1.5 text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800" title="Download" @click="handleDownload(doc.id, doc.originalFilename)"><Download class="size-4" /></button><button type="button" class="rounded-md p-1.5 text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800" title="Reparse" :disabled="reparsingDocId === doc.id" @click="reparseDocument(doc.id)"><RefreshCw class="size-4" :class="{ 'animate-spin': reparsingDocId === doc.id }" /></button><button type="button" class="rounded-md p-1.5 text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-950" title="Delete" @click="showDocDeleteConfirm = doc.id"><Trash2 class="size-4" /></button></div></div><div v-if="showDocDeleteConfirm === doc.id" class="mt-3 rounded-lg bg-danger-50 p-3 text-xs dark:bg-danger-950/30"><p class="text-danger-700 dark:text-danger-300">Delete this document?</p><div class="mt-2 flex gap-2"><button type="button" class="rounded bg-danger-600 px-2.5 py-1 text-white" :disabled="isDeletingDoc" @click="handleDeleteDocument(doc.id)">Delete</button><button type="button" class="rounded border border-surface-300 px-2.5 py-1" @click="showDocDeleteConfirm = null">Cancel</button></div></div></div></div>
            <p v-else class="py-8 text-center text-sm text-surface-400">No documents uploaded.</p>
          </div>

          <div v-else-if="activeTab === 'responses'" class="space-y-4">
            <div v-if="application.responses?.length" class="space-y-3"><div v-for="response in application.responses" :key="response.id" class="rounded-xl border border-surface-200 dark:border-surface-700 p-4"><p class="text-sm font-medium text-surface-800 dark:text-surface-100">{{ response.question?.label ?? 'Question' }}</p><p class="mt-1.5 text-sm text-surface-600 dark:text-surface-300">{{ formatResponseValue(response.value) }}</p></div></div><p v-else class="py-8 text-center text-sm text-surface-400">No application responses.</p>
          </div>

          <div v-else-if="activeTab === 'ai_analysis'" class="space-y-4">
            <div class="rounded-xl border border-surface-200 dark:border-surface-700 p-4"><div class="flex items-start gap-3"><Brain class="mt-0.5 size-5 text-brand-500" /><div><h3 class="text-sm font-semibold">AI Analysis</h3><p class="mt-1 text-xs text-surface-500">AI scoring is advisory only. Recruiter judgement remains the hiring decision.</p></div></div><button type="button" class="mt-4 rounded-lg bg-brand-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50" :disabled="aiStatus === 'loading'" @click="runAiAnalysis">{{ aiStatus === 'loading' ? 'Analysing…' : 'Run analysis' }}</button></div>
            <p v-if="aiError" class="text-xs text-danger-600">{{ aiError }}</p>
            <pre v-if="aiResult" class="max-h-80 overflow-auto rounded-xl bg-surface-50 p-4 text-xs dark:bg-surface-800">{{ JSON.stringify(aiResult, null, 2) }}</pre>
          </div>

          <div v-else-if="activeTab === 'timeline'" class="space-y-4">
            <button v-if="!timelineLoaded && !timelineLoading" type="button" class="rounded-lg border border-surface-300 px-3 py-2 text-xs font-medium" @click="loadTimeline"><History class="mr-1 inline size-3.5" />Load timeline</button><div v-if="timelineLoading" class="py-8 text-center text-sm text-surface-400">Loading timeline…</div><p v-if="timelineError" class="text-xs text-danger-600">{{ timelineError }}</p><div v-if="timelineLoaded && timelineItems.length" class="space-y-3"><div v-for="item in timelineItems" :key="item.id" class="flex gap-3"><span class="mt-1.5 size-2 shrink-0 rounded-full" :class="getTimelineActionColor(item.action)" /><div><p class="text-sm text-surface-700 dark:text-surface-300">{{ describeTimelineItem(item) }}</p><p class="mt-0.5 text-xs text-surface-400">{{ formatTimelineDate(item.createdAt) }}</p></div></div></div><p v-else-if="timelineLoaded" class="py-8 text-center text-sm text-surface-400">No timeline activity.</p>
          </div>
        </div>
      </div>

      <!-- Preview overlay -->
      <div v-if="showPreview" class="absolute inset-0 z-10 flex flex-col bg-white dark:bg-surface-900"><div class="flex items-center gap-3 border-b border-surface-200 dark:border-surface-800 px-4 py-3"><button type="button" class="rounded-lg p-1.5 hover:bg-surface-100 dark:hover:bg-surface-800" @click="closePreview"><ArrowLeft class="size-4" /></button><div class="min-w-0 flex-1"><p class="truncate text-sm font-medium">{{ previewFilename }}</p></div><a v-if="previewUrl" :href="previewUrl" target="_blank" rel="noopener" class="rounded-lg p-1.5 hover:bg-surface-100 dark:hover:bg-surface-800"><ExternalLink class="size-4" /></a></div><div class="flex-1 overflow-hidden"><div v-if="isLoadingPreview" class="flex h-full items-center justify-center"><RefreshCw class="size-6 animate-spin text-brand-500" /></div><div v-else-if="previewError" class="flex h-full flex-col items-center justify-center gap-2 p-6 text-center"><AlertTriangle class="size-8 text-warning-500" /><p class="text-sm text-surface-600 dark:text-surface-300">{{ previewError }}</p></div><iframe v-else-if="isPdfPreview && previewUrl" :src="previewUrl" class="h-full w-full" title="Document preview" /><div v-else-if="previewUrl" class="flex h-full flex-col items-center justify-center gap-3"><FileText class="size-10 text-surface-400" /><p class="text-sm text-surface-500">Preview is not available for this file type.</p><a :href="previewUrl" target="_blank" rel="noopener" class="text-sm font-medium text-brand-600">Open document</a></div></div></div>
    </aside>
  </Transition>
</template>
