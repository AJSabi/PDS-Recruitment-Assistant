<script setup lang="ts">
import { ArrowLeft, Download, Eye, FileText, Mail, Pencil, Phone, Trash2, Upload, X } from 'lucide-vue-next'
import { z } from 'zod'
import { usePreviewReadOnly } from '~/composables/usePreviewReadOnly'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'require-org'] })

const route = useRoute()
const localePath = useLocalePath()
const candidateId = route.params.id as string
const toast = useToast()
const { handlePreviewReadOnlyError } = usePreviewReadOnly()
const { candidate, status: fetchStatus, error, updateCandidate, deleteCandidate, refresh } = useCandidate(candidateId)
const { formatCandidateName, formatDate } = useOrgSettings()
const { uploadDocument, downloadDocument, getPreviewUrl, deleteDocument } = useDocuments()

useSeoMeta({ title: computed(() => candidate.value ? `${candidate.value.firstName} ${candidate.value.lastName}` : 'Candidate') })

const activeTab = ref<'applications' | 'documents'>('applications')
const isEditing = ref(false)
const isSaving = ref(false)
const isDeleting = ref(false)
const showDeleteConfirm = ref(false)
const editErrors = ref<Record<string, string>>({})
const editForm = ref({ firstName: '', lastName: '', displayName: '', email: '', phone: '', gender: '' as '' | 'male' | 'female' | 'other' | 'prefer_not_to_say', dateOfBirth: '' })

const editSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  displayName: z.string().max(200).optional(),
  email: z.string().min(1, 'Email is required').email('Invalid email address').max(255),
  phone: z.string().max(50).optional(),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
})

function startEdit() {
  if (!candidate.value) return
  editForm.value = {
    firstName: candidate.value.firstName,
    lastName: candidate.value.lastName,
    displayName: candidate.value.displayName ?? '',
    email: candidate.value.email,
    phone: candidate.value.phone ?? '',
    gender: (candidate.value.gender as any) ?? '',
    dateOfBirth: candidate.value.dateOfBirth ?? '',
  }
  isEditing.value = true
}

async function saveCandidate() {
  const parsed = editSchema.safeParse({
    ...editForm.value,
    displayName: editForm.value.displayName || undefined,
    phone: editForm.value.phone || undefined,
    gender: editForm.value.gender || undefined,
    dateOfBirth: editForm.value.dateOfBirth || undefined,
  })
  if (!parsed.success) {
    editErrors.value = {}
    for (const issue of parsed.error.issues) if (issue.path[0]) editErrors.value[String(issue.path[0])] = issue.message
    return
  }
  isSaving.value = true
  try {
    await updateCandidate({
      firstName: editForm.value.firstName,
      lastName: editForm.value.lastName,
      displayName: editForm.value.displayName || null,
      email: editForm.value.email,
      phone: editForm.value.phone || null,
      gender: (editForm.value.gender as any) || null,
      dateOfBirth: editForm.value.dateOfBirth || null,
    })
    isEditing.value = false
    editErrors.value = {}
  } catch (err: any) {
    if (!handlePreviewReadOnlyError(err)) toast.error('Failed to save candidate', { message: err?.data?.statusMessage ?? err?.message })
  } finally { isSaving.value = false }
}

async function removeCandidate() {
  isDeleting.value = true
  try { await deleteCandidate() }
  catch (err: any) {
    if (!handlePreviewReadOnlyError(err)) toast.error('Failed to delete candidate', { message: err?.data?.statusMessage ?? err?.message })
    isDeleting.value = false
  }
}

const applicationStatusClasses: Record<string, string> = {
  new: 'bg-blue-50 text-blue-700', screening: 'bg-violet-50 text-violet-700', interview: 'bg-amber-50 text-amber-700', offer: 'bg-teal-50 text-teal-700', hired: 'bg-green-50 text-green-700', rejected: 'bg-surface-100 text-surface-600',
}
const genderLabels: Record<string, string> = { male: 'Male', female: 'Female', other: 'Other', prefer_not_to_say: 'Prefer not to say' }
const documentTypeLabels: Record<string, string> = { resume: 'Resume', cover_letter: 'Cover Letter', other: 'Other' }

const fileInput = ref<HTMLInputElement | null>(null)
const selectedDocType = ref<'resume' | 'cover_letter' | 'other'>('resume')
const isUploading = ref(false)
const showDocDeleteConfirm = ref<string | null>(null)
const isDeletingDoc = ref(false)
const showPreview = ref(false)
const previewUrl = ref<string | null>(null)
const previewFilename = ref('')

async function handleFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  isUploading.value = true
  try {
    await uploadDocument(candidateId, file, selectedDocType.value)
    await refresh()
  } catch (err: any) { toast.error('Upload failed', { message: err?.data?.statusMessage ?? err?.message }) }
  finally { isUploading.value = false; input.value = '' }
}
async function handleDownload(id: string) {
  try { await downloadDocument(id) } catch { toast.error('Failed to download document') }
}
function handlePreview(id: string, mimeType?: string, filename?: string) {
  if (mimeType && mimeType !== 'application/pdf') return handleDownload(id)
  previewFilename.value = filename ?? 'Resume'
  previewUrl.value = getPreviewUrl(id)
  showPreview.value = true
}
async function handleDeleteDoc(id: string) {
  isDeletingDoc.value = true
  try { await deleteDocument(id, candidateId); await refresh(); showDocDeleteConfirm.value = null }
  catch (err: any) { toast.error('Failed to delete document', { message: err?.data?.statusMessage ?? err?.message }) }
  finally { isDeletingDoc.value = false }
}
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-5">
    <NuxtLink :to="localePath('/dashboard/candidates')" class="inline-flex items-center gap-1 text-sm text-surface-500 hover:text-surface-800"><ArrowLeft class="size-4" />Candidate Database</NuxtLink>

    <div v-if="fetchStatus === 'pending'" class="py-12 text-center text-surface-400">Loading candidate…</div>
    <div v-else-if="error" class="rounded-xl border border-danger-200 bg-danger-50 p-5 text-danger-700">Candidate could not be loaded.</div>

    <template v-else-if="candidate">
      <section class="rounded-2xl border border-surface-200 bg-white p-6 shadow-sm dark:border-surface-800 dark:bg-surface-900">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.15em] text-[#1F6FA3]">Central Candidate Database</p>
            <h1 class="mt-1 text-2xl font-bold text-[#102A43] dark:text-white">{{ formatCandidateName(candidate) }}</h1>
            <div class="mt-2 flex flex-wrap gap-4 text-sm text-surface-500"><a :href="`mailto:${candidate.email}`" class="inline-flex items-center gap-1 hover:underline"><Mail class="size-4" />{{ candidate.email }}</a><span v-if="candidate.phone" class="inline-flex items-center gap-1"><Phone class="size-4" />{{ candidate.phone }}</span></div>
          </div>
          <div class="flex gap-2"><button class="inline-flex items-center gap-1.5 rounded-lg border border-surface-300 px-3 py-2 text-sm font-semibold" @click="startEdit"><Pencil class="size-4" />Edit</button><button class="inline-flex items-center gap-1.5 rounded-lg border border-danger-300 px-3 py-2 text-sm font-semibold text-danger-600" @click="showDeleteConfirm = true"><Trash2 class="size-4" />Delete</button></div>
        </div>
        <div class="mt-5 grid gap-3 sm:grid-cols-3"><div><p class="text-xs text-surface-400">Display name</p><p class="font-medium">{{ candidate.displayName || '—' }}</p></div><div><p class="text-xs text-surface-400">Gender</p><p class="font-medium">{{ candidate.gender ? (genderLabels[candidate.gender] ?? candidate.gender) : '—' }}</p></div><div><p class="text-xs text-surface-400">Date of birth</p><p class="font-medium">{{ candidate.dateOfBirth ? formatDate(candidate.dateOfBirth) : '—' }}</p></div></div>
        <div class="mt-4 rounded-xl border border-[#BED9E9] bg-[#F7FBFE] px-4 py-3 text-sm text-[#1F6FA3]">Candidate identity and resumes are shared organisation-wide. Requirement-specific recruitment history below is limited to requirements you are authorised to access. Add candidates to another requirement from that requirement's JD & Skill Matrix / Add Candidate flow.</div>
      </section>

      <section v-if="isEditing" class="rounded-2xl border border-surface-200 bg-white p-6 shadow-sm dark:border-surface-800 dark:bg-surface-900">
        <h2 class="font-bold text-[#102A43] dark:text-white">Edit Candidate</h2>
        <div class="mt-4 grid gap-4 sm:grid-cols-2">
          <label class="text-sm">First name<input v-model="editForm.firstName" class="mt-1 w-full rounded-lg border border-surface-300 px-3 py-2" /><span v-if="editErrors.firstName" class="text-xs text-danger-600">{{ editErrors.firstName }}</span></label>
          <label class="text-sm">Last name<input v-model="editForm.lastName" class="mt-1 w-full rounded-lg border border-surface-300 px-3 py-2" /></label>
          <label class="text-sm">Email<input v-model="editForm.email" type="email" class="mt-1 w-full rounded-lg border border-surface-300 px-3 py-2" /></label>
          <label class="text-sm">Phone<input v-model="editForm.phone" class="mt-1 w-full rounded-lg border border-surface-300 px-3 py-2" /></label>
          <label class="text-sm">Display name<input v-model="editForm.displayName" class="mt-1 w-full rounded-lg border border-surface-300 px-3 py-2" /></label>
          <label class="text-sm">Date of birth<input v-model="editForm.dateOfBirth" type="date" class="mt-1 w-full rounded-lg border border-surface-300 px-3 py-2" /></label>
        </div>
        <div class="mt-4 flex gap-2"><button :disabled="isSaving" class="rounded-lg bg-[#1F6FA3] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" @click="saveCandidate">{{ isSaving ? 'Saving…' : 'Save' }}</button><button class="rounded-lg border border-surface-300 px-4 py-2 text-sm font-semibold" @click="isEditing = false">Cancel</button></div>
      </section>

      <div class="flex border-b border-surface-200"><button class="px-4 py-3 text-sm font-semibold" :class="activeTab === 'applications' ? 'border-b-2 border-[#1F6FA3] text-[#1F6FA3]' : 'text-surface-500'" @click="activeTab = 'applications'">Recruitment History ({{ candidate.applications?.length ?? 0 }})</button><button class="px-4 py-3 text-sm font-semibold" :class="activeTab === 'documents' ? 'border-b-2 border-[#1F6FA3] text-[#1F6FA3]' : 'text-surface-500'" @click="activeTab = 'documents'">Documents ({{ candidate.documents?.length ?? 0 }})</button></div>

      <section v-if="activeTab === 'applications'" class="space-y-3">
        <div v-if="!candidate.applications?.length" class="rounded-2xl border border-dashed border-surface-300 p-8 text-center text-sm text-surface-400">No accessible recruitment history for this candidate.</div>
        <NuxtLink v-for="app in candidate.applications" :key="app.id" :to="localePath(`/dashboard/recruitment/${app.id}`)" class="flex items-center justify-between gap-4 rounded-2xl border border-surface-200 bg-white p-5 no-underline shadow-sm hover:border-[#9FC7DF] dark:border-surface-800 dark:bg-surface-900">
          <div><p class="font-bold text-[#102A43] dark:text-white">{{ app.job.title }}</p><p class="mt-1 text-xs text-surface-400">Added {{ formatDate(app.createdAt) }}</p></div><div class="flex items-center gap-3"><span class="rounded-full px-2.5 py-1 text-xs font-semibold" :class="applicationStatusClasses[app.status] ?? 'bg-surface-100 text-surface-600'">{{ app.status }}</span><span class="text-xs font-semibold text-[#1F6FA3]">Open Recruitment →</span></div>
        </NuxtLink>
      </section>

      <section v-else class="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm dark:border-surface-800 dark:bg-surface-900">
        <div class="flex flex-wrap items-center justify-between gap-3"><div><h2 class="font-bold text-[#102A43] dark:text-white">Candidate Documents</h2><p class="text-sm text-surface-500">Upload and maintain candidate resumes/documents. Recruitment assessment uses the newest readable resume.</p></div><div class="flex gap-2"><select v-model="selectedDocType" class="rounded-lg border border-surface-300 px-3 py-2 text-sm"><option value="resume">Resume</option><option value="cover_letter">Cover Letter</option><option value="other">Other</option></select><input ref="fileInput" type="file" class="hidden" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" @change="handleFileSelected" /><button :disabled="isUploading" class="inline-flex items-center gap-1.5 rounded-lg bg-[#1F6FA3] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" @click="fileInput?.click()"><Upload class="size-4" />{{ isUploading ? 'Uploading…' : 'Upload' }}</button></div></div>
        <div class="mt-4 space-y-2"><div v-for="doc in candidate.documents" :key="doc.id" class="flex items-center justify-between gap-3 rounded-xl border border-surface-200 p-3"><div class="flex min-w-0 items-center gap-3"><FileText class="size-5 shrink-0 text-[#1F6FA3]" /><div class="min-w-0"><p class="truncate text-sm font-semibold">{{ doc.originalFilename }}</p><p class="text-xs text-surface-400">{{ documentTypeLabels[doc.type] ?? doc.type }} · {{ formatDate(doc.createdAt) }}<span v-if="doc.type === 'resume' && !doc.parsed" class="ml-2 text-warning-600">Unreadable for AI match</span></p></div></div><div class="flex gap-1"><button class="rounded-lg p-2 hover:bg-surface-100" title="View" @click="handlePreview(doc.id, doc.mimeType, doc.originalFilename)"><Eye class="size-4" /></button><button class="rounded-lg p-2 hover:bg-surface-100" title="Download" @click="handleDownload(doc.id)"><Download class="size-4" /></button><button class="rounded-lg p-2 text-danger-600 hover:bg-danger-50" title="Delete" @click="showDocDeleteConfirm = doc.id"><Trash2 class="size-4" /></button></div></div><div v-if="!candidate.documents?.length" class="py-8 text-center text-sm text-surface-400">No documents uploaded.</div></div>
      </section>
    </template>

    <div v-if="showDeleteConfirm" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"><div class="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"><h3 class="font-bold">Delete candidate?</h3><p class="mt-2 text-sm text-surface-500">This action is subject to server-side retention and application safeguards.</p><div class="mt-5 flex justify-end gap-2"><button class="rounded-lg border px-3 py-2 text-sm" @click="showDeleteConfirm = false">Cancel</button><button :disabled="isDeleting" class="rounded-lg bg-danger-600 px-3 py-2 text-sm font-semibold text-white" @click="removeCandidate">{{ isDeleting ? 'Deleting…' : 'Delete' }}</button></div></div></div>
    <div v-if="showDocDeleteConfirm" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"><div class="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"><h3 class="font-bold">Delete document?</h3><div class="mt-5 flex justify-end gap-2"><button class="rounded-lg border px-3 py-2 text-sm" @click="showDocDeleteConfirm = null">Cancel</button><button :disabled="isDeletingDoc" class="rounded-lg bg-danger-600 px-3 py-2 text-sm font-semibold text-white" @click="handleDeleteDoc(showDocDeleteConfirm!)">Delete</button></div></div></div>
    <div v-if="showPreview" class="fixed inset-0 z-50 flex flex-col bg-black/80"><div class="flex items-center justify-between bg-white px-4 py-3"><p class="font-semibold">{{ previewFilename }}</p><button class="rounded-lg p-2" @click="showPreview = false; previewUrl = null"><X class="size-5" /></button></div><iframe v-if="previewUrl" :src="previewUrl" class="h-full w-full bg-white" /></div>
  </div>
</template>
