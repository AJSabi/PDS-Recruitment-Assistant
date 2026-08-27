<script setup lang="ts">
import { FileText, Loader2, Search, Upload, UserPlus, UserRoundPlus, X } from 'lucide-vue-next'
import { usePreviewReadOnly } from '~/composables/usePreviewReadOnly'

const props = withDefaults(defineProps<{
  jobId: string
  teleportTarget?: string | HTMLElement
}>(), { teleportTarget: 'body' })

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'created', payload?: { applicationId?: string; created?: boolean; resumeUploaded?: boolean }): void
}>()

const toast = useToast()
const mode = ref<'existing' | 'new'>('new')
const searchInput = ref('')
const debouncedSearch = ref<string | undefined>(undefined)
const selectedExistingCandidateId = ref<string | null>(null)
const resumeFile = ref<File | null>(null)
const isParsingResume = ref(false)
let debounceTimer: ReturnType<typeof setTimeout>

watch(searchInput, (val) => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => { debouncedSearch.value = val.trim() || undefined }, 300)
})
watch(mode, () => {
  selectedExistingCandidateId.value = null
  resumeFile.value = null
})

const { data: candidateData, status: searchStatus } = useFetch('/api/candidates', {
  key: `apply-candidate-search-${props.jobId}`,
  query: computed(() => ({ ...(debouncedSearch.value && { search: debouncedSearch.value }), limit: 20 })),
  headers: useRequestHeaders(['cookie']),
})
const candidates = computed(() => candidateData.value?.data ?? [])
const selectedExistingCandidate = computed(() => candidates.value.find((c: any) => c.id === selectedExistingCandidateId.value) ?? null)
const { handlePreviewReadOnlyError } = usePreviewReadOnly()
const { formatCandidateName } = useOrgSettings()

const isApplying = ref(false)
const applyError = ref('')
const newCandidate = reactive({ firstName: '', lastName: '', email: '', phone: '', notes: '' })
function resetError() { applyError.value = '' }

async function parseResumeIdentity(file: File) {
  isParsingResume.value = true
  try {
    const form = new FormData()
    form.append('file', file)
    const result: any = await $fetch(`/api/jobs/${props.jobId}/resume-identity`, { method: 'POST', body: form })
    const identity = result?.identity ?? {}
    if (!newCandidate.firstName.trim() && identity.firstName) newCandidate.firstName = identity.firstName
    if (!newCandidate.lastName.trim() && identity.lastName) newCandidate.lastName = identity.lastName
    if (!newCandidate.email.trim() && identity.email) newCandidate.email = identity.email
    if (!newCandidate.phone.trim() && identity.phone) newCandidate.phone = identity.phone
    if (!identity.email) toast.info('Resume read', 'Name/contact details were only partially detected. Please review the fields before adding the candidate.')
  } catch (err: any) {
    toast.warning('Resume selected', err?.data?.statusMessage ?? err?.message ?? 'The resume could not be parsed automatically. Enter the candidate details manually.')
  } finally {
    isParsingResume.value = false
  }
}

async function onResumeSelected(event: Event) {
  const input = event.target as HTMLInputElement
  resumeFile.value = input.files?.[0] ?? null
  resetError()
  if (mode.value === 'new' && resumeFile.value) await parseResumeIdentity(resumeFile.value)
}

async function uploadResume(candidateId: string) {
  if (!resumeFile.value) return false
  const form = new FormData()
  form.append('file', resumeFile.value)
  form.append('type', 'resume')
  await $fetch(`/api/candidates/${candidateId}/documents`, { method: 'POST', body: form })
  return true
}

async function refreshCandidateMatching() {
  try {
    const result: any = await $fetch(`/api/jobs/${props.jobId}/talent-pool/sync`, { method: 'POST' })
    if (result.deferredForAiBudget) {
      toast.info('Candidate added', `${result.deferredForAiBudget} plausible resume(s) remain for the next database refresh. The AI Candidate Pool only shows 50%+ matches.`)
    } else {
      toast.success('Candidate added and matching refreshed', { message: 'The AI Candidate Pool shows only candidates scoring 50% or more. Lower matches remain safely in the Candidate Database.' })
    }
  } catch (err: any) {
    const message = err?.data?.statusMessage ?? err?.message ?? 'Matching could not be refreshed.'
    toast.warning('Candidate added; AI matching pending', `${message} The candidate and resume are saved and can be analysed from AI Candidate Pool.`)
  }
}

async function attachCandidate(body: Record<string, unknown>) {
  isApplying.value = true
  applyError.value = ''
  try {
    const result: any = await $fetch(`/api/jobs/${props.jobId}/candidate-intake`, { method: 'POST', body })
    const candidateId = result?.candidate?.id
    let resumeUploaded = false
    if (resumeFile.value) {
      if (!candidateId) throw new Error('Candidate was linked, but the candidate record was not returned for resume upload.')
      try {
        resumeUploaded = await uploadResume(candidateId)
      } catch (uploadErr: any) {
        applyError.value = `Candidate is linked to this requirement, but the resume upload failed: ${uploadErr?.data?.statusMessage ?? uploadErr?.message ?? 'Unknown upload error'}`
        return
      }
      await refreshCandidateMatching()
    } else {
      toast.success('Candidate added to requirement', { message: 'Add a resume before AI matching can assess this candidate.' })
    }
    emit('created', { applicationId: result.applicationId, created: result.created, resumeUploaded })
  } catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    applyError.value = err?.data?.statusMessage ?? err?.message ?? 'Failed to add candidate to this requirement.'
  } finally { isApplying.value = false }
}

async function applyExistingCandidate() {
  if (!selectedExistingCandidateId.value) return void (applyError.value = 'Select a candidate from the Candidate Database.')
  await attachCandidate({ candidateId: selectedExistingCandidateId.value })
}

async function createCandidate() {
  const firstName = newCandidate.firstName.trim()
  const lastName = newCandidate.lastName.trim()
  const email = newCandidate.email.trim()
  if (!firstName || !lastName || !email) return void (applyError.value = 'First name, last name and email are required.')
  await attachCandidate({
    firstName,
    lastName,
    email,
    phone: newCandidate.phone.trim() || undefined,
    notes: newCandidate.notes.trim() || undefined,
  })
}
</script>

<template>
  <Teleport :to="teleportTarget">
    <div class="fixed inset-0 z-[250] flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="emit('close')" />
      <div class="relative mx-4 flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-surface-900">
        <div class="flex items-center justify-between border-b border-surface-200 px-5 py-4 dark:border-surface-800">
          <div class="flex items-center gap-2"><UserPlus class="size-5 text-brand-600" /><div><h3 class="text-lg font-semibold text-surface-900 dark:text-surface-50">Add Candidate to Requirement</h3><p class="mt-0.5 text-xs text-surface-500">Upload a resume to prefill candidate details, then link the candidate to this requirement.</p></div></div>
          <button type="button" class="text-surface-400 hover:text-surface-600" @click="emit('close')"><X class="size-5" /></button>
        </div>

        <div class="border-b border-surface-200 px-5 pt-4 dark:border-surface-800">
          <div class="flex gap-1 rounded-xl bg-surface-100 p-1 dark:bg-surface-800">
            <button type="button" class="flex-1 rounded-lg px-3 py-2 text-sm font-semibold" :class="mode === 'new' ? 'bg-white text-[#102A43] shadow-sm dark:bg-surface-900 dark:text-white' : 'text-surface-500'" @click="mode = 'new'; resetError()">New Candidate</button>
            <button type="button" class="flex-1 rounded-lg px-3 py-2 text-sm font-semibold" :class="mode === 'existing' ? 'bg-white text-[#102A43] shadow-sm dark:bg-surface-900 dark:text-white' : 'text-surface-500'" @click="mode = 'existing'; resetError()">Existing Candidate</button>
          </div>
        </div>

        <div v-if="applyError" class="mx-5 mt-4 rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">{{ applyError }}</div>

        <div v-if="mode === 'new'" class="overflow-y-auto px-5 py-5">
          <div class="mb-4 flex items-start gap-3 rounded-xl border border-[#CFE0ED] bg-[#F7FBFE] p-4"><UserRoundPlus class="mt-0.5 size-5 text-[#2E86C1]" /><div><p class="text-sm font-semibold text-[#102A43]">Create directly in this requirement</p><p class="mt-1 text-xs leading-5 text-surface-500">Resume parsing prefills detected name, email and phone. Review the details before saving.</p></div></div>
          <form class="space-y-4" @submit.prevent="createCandidate">
            <label class="block rounded-xl border border-dashed border-[#9FC7DF] bg-[#F7FBFE] p-4 text-sm">
              <span class="flex items-center gap-2 font-semibold text-[#102A43]"><Upload class="size-4 text-[#2E86C1]" />Resume <span class="font-normal text-surface-400">(recommended)</span></span>
              <span class="mt-1 block text-xs text-surface-500">PDF, DOC or DOCX. Candidate details are parsed locally without an AI call.</span>
              <input :disabled="isApplying || isParsingResume" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" class="mt-3 block w-full text-xs" @change="onResumeSelected" />
              <span v-if="isParsingResume" class="mt-2 flex items-center gap-1.5 text-xs text-brand-600"><Loader2 class="size-3.5 animate-spin" />Reading candidate details…</span>
              <span v-else-if="resumeFile" class="mt-2 flex items-center gap-1.5 text-xs font-medium text-[#13756F]"><FileText class="size-3.5" />{{ resumeFile.name }}</span>
            </label>
            <div class="grid gap-4 sm:grid-cols-2">
              <label class="text-sm font-medium">First name <span class="text-danger-500">*</span><input v-model="newCandidate.firstName" :disabled="isApplying" class="mt-1.5 w-full rounded-lg border border-surface-300 px-3 py-2.5 text-sm" /></label>
              <label class="text-sm font-medium">Last name <span class="text-danger-500">*</span><input v-model="newCandidate.lastName" :disabled="isApplying" class="mt-1.5 w-full rounded-lg border border-surface-300 px-3 py-2.5 text-sm" /></label>
            </div>
            <label class="block text-sm font-medium">Email <span class="text-danger-500">*</span><input v-model="newCandidate.email" :disabled="isApplying" type="email" class="mt-1.5 w-full rounded-lg border border-surface-300 px-3 py-2.5 text-sm" /></label>
            <label class="block text-sm font-medium">Phone<input v-model="newCandidate.phone" :disabled="isApplying" type="tel" class="mt-1.5 w-full rounded-lg border border-surface-300 px-3 py-2.5 text-sm" /></label>
            <label class="block text-sm font-medium">Recruiter note <span class="font-normal text-surface-400">(optional)</span><textarea v-model="newCandidate.notes" :disabled="isApplying" rows="3" class="mt-1.5 w-full rounded-lg border border-surface-300 px-3 py-2.5 text-sm" /></label>
            <div class="flex justify-end gap-2 border-t border-surface-100 pt-4"><button type="button" :disabled="isApplying" class="rounded-lg border border-surface-300 px-4 py-2 text-sm" @click="emit('close')">Cancel</button><button type="submit" :disabled="isApplying || isParsingResume" class="inline-flex items-center gap-2 rounded-lg bg-[#16847F] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Loader2 v-if="isApplying" class="size-4 animate-spin" /><UserPlus v-else class="size-4" />{{ isApplying ? 'Adding…' : (resumeFile ? 'Add & Refresh Match' : 'Add to Requirement') }}</button></div>
          </form>
        </div>

        <template v-else>
          <div class="px-5 pt-4"><div class="relative"><Search class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-surface-400" /><input v-model="searchInput" type="text" placeholder="Search Candidate Database by name or email…" class="w-full rounded-lg border border-surface-200 py-2.5 pl-10 pr-3 text-sm" /></div></div>
          <div class="flex-1 overflow-y-auto px-5 py-3">
            <div v-if="searchStatus === 'pending'" class="py-8 text-center text-sm text-surface-400">Searching…</div>
            <div v-else-if="candidates.length === 0" class="py-8 text-center text-sm text-surface-400">No candidates found.</div>
            <div v-else class="space-y-1"><button v-for="c in candidates" :key="c.id" type="button" class="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left" :class="selectedExistingCandidateId === c.id ? 'bg-brand-50 ring-1 ring-brand-200' : 'hover:bg-surface-50'" @click="selectedExistingCandidateId = c.id; resetError()"><div class="min-w-0"><p class="truncate text-sm font-medium">{{ formatCandidateName(c) }}</p><p class="truncate text-xs text-surface-400">{{ c.email }}</p></div><span class="text-xs font-semibold text-brand-600">{{ selectedExistingCandidateId === c.id ? 'Selected' : 'Select' }}</span></button></div>
            <div v-if="selectedExistingCandidate" class="mt-4 rounded-xl border border-[#CFE0ED] bg-[#F7FBFE] p-4"><p class="text-sm font-semibold text-[#102A43]">Selected: {{ formatCandidateName(selectedExistingCandidate) }}</p><label class="mt-3 block text-sm font-medium">Add a newer resume <span class="font-normal text-surface-400">(optional)</span><input :disabled="isApplying" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" class="mt-2 block w-full text-xs" @change="onResumeSelected" /></label><span v-if="resumeFile" class="mt-2 flex items-center gap-1.5 text-xs font-medium text-[#13756F]"><FileText class="size-3.5" />{{ resumeFile.name }}</span></div>
          </div>
          <div class="flex justify-end gap-2 border-t border-surface-200 px-5 py-4"><button type="button" :disabled="isApplying" class="rounded-lg border border-surface-300 px-4 py-2 text-sm" @click="emit('close')">Cancel</button><button type="button" :disabled="isApplying || !selectedExistingCandidateId" class="inline-flex items-center gap-2 rounded-lg bg-[#16847F] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" @click="applyExistingCandidate"><Loader2 v-if="isApplying" class="size-4 animate-spin" /><UserPlus v-else class="size-4" />{{ isApplying ? 'Adding…' : (resumeFile ? 'Add & Refresh Match' : 'Add to Requirement') }}</button></div>
        </template>
      </div>
    </div>
  </Teleport>
</template>
