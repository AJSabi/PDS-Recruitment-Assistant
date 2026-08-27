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
const localePath = useLocalePath()
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
const matchResult = ref<any | null>(null)
const completedPayload = ref<{ applicationId?: string; created?: boolean; resumeUploaded?: boolean } | null>(null)
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
  if (!resumeFile.value) return null
  const form = new FormData()
  form.append('file', resumeFile.value)
  form.append('type', 'resume')
  return await $fetch(`/api/candidates/${candidateId}/documents`, { method: 'POST', body: form }) as any
}

async function calculateImmediateMatch(applicationId: string) {
  return await $fetch(`/api/applications/${applicationId}/quick-match`, { method: 'POST' }) as any
}

function finishAndClose() {
  if (completedPayload.value) emit('created', completedPayload.value)
  else emit('close')
}

async function openRecruiterScreening() {
  const applicationId = completedPayload.value?.applicationId
  if (!applicationId) return
  emit('created', completedPayload.value ?? undefined)
  await navigateTo(localePath(`/dashboard/recruitment/${applicationId}`))
}

async function attachCandidate(body: Record<string, unknown>) {
  isApplying.value = true
  applyError.value = ''
  matchResult.value = null
  try {
    const result: any = await $fetch(`/api/jobs/${props.jobId}/candidate-intake`, { method: 'POST', body })
    const candidateId = result?.candidate?.id
    let resumeUploaded = false
    completedPayload.value = { applicationId: result.applicationId, created: result.created, resumeUploaded: false }

    if (resumeFile.value) {
      if (!candidateId) throw new Error('Candidate was linked, but the candidate record was not returned for resume upload.')
      try {
        const uploaded = await uploadResume(candidateId)
        resumeUploaded = Boolean(uploaded?.id)
        completedPayload.value.resumeUploaded = resumeUploaded
      } catch (uploadErr: any) {
        applyError.value = `Candidate is linked to this requirement, but the resume upload failed: ${uploadErr?.data?.statusMessage ?? uploadErr?.message ?? 'Unknown upload error'}`
        return
      }

      try {
        matchResult.value = await calculateImmediateMatch(result.applicationId)
        toast.success(`AI Match: ${matchResult.value.score}%`, {
          message: 'This is AI decision support only. The recruiter can validate or override the interpretation through Recruiter Screening.',
        })
      } catch (matchErr: any) {
        const message = matchErr?.data?.statusMessage ?? matchErr?.message ?? 'AI matching could not be completed.'
        matchResult.value = { unavailable: true, message }
        toast.warning('Candidate added; match unavailable', `${message} The candidate remains saved and can still be reviewed manually.`)
      }
    } else {
      matchResult.value = { unavailable: true, message: 'Add a resume to calculate the AI match percentage.' }
      toast.success('Candidate added to requirement', { message: 'Add a resume to calculate the AI match percentage.' })
    }
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
      <div class="absolute inset-0 bg-black/50" @click="finishAndClose" />
      <div class="relative mx-4 flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-surface-900">
        <div class="flex items-center justify-between border-b border-surface-200 px-5 py-4 dark:border-surface-800">
          <div class="flex items-center gap-2"><UserPlus class="size-5 text-brand-600" /><div><h3 class="text-lg font-semibold text-surface-900 dark:text-surface-50">Add Candidate to Requirement</h3><p class="mt-0.5 text-xs text-surface-500">Upload a resume, add the candidate and get an immediate AI match against the approved JD & Skill Matrix.</p></div></div>
          <button type="button" class="text-surface-400 hover:text-surface-600" @click="finishAndClose"><X class="size-5" /></button>
        </div>

        <div v-if="matchResult" class="overflow-y-auto px-5 py-5">
          <div v-if="!matchResult.unavailable" class="space-y-4">
            <div class="rounded-2xl border border-[#CFE0ED] bg-[#F7FBFE] p-5">
              <p class="text-xs font-bold uppercase tracking-wide text-[#1F6FA3]">AI Match against approved JD & Skill Matrix</p>
              <div class="mt-3 flex items-end gap-3"><span class="text-5xl font-black text-[#102A43]">{{ matchResult.score }}%</span><span class="mb-1 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-[#16847F] shadow-sm">{{ matchResult.priority }}</span></div>
              <p class="mt-3 text-sm text-surface-600">{{ matchResult.jdAlignment || matchResult.candidateSnapshot }}</p>
            </div>
            <div class="grid gap-3 sm:grid-cols-3">
              <div class="rounded-xl bg-[#F1FAF8] p-3"><p class="text-[10px] font-bold uppercase tracking-wide text-[#16847F]">Mandatory Match</p><p class="mt-1 text-sm font-semibold text-surface-800">{{ matchResult.mandatoryMatch || '—' }}</p></div>
              <div class="rounded-xl bg-[#F7FBFE] p-3"><p class="text-[10px] font-bold uppercase tracking-wide text-[#1F6FA3]">Key Strength</p><p class="mt-1 text-sm font-semibold text-surface-800">{{ matchResult.keyStrength || '—' }}</p></div>
              <div class="rounded-xl bg-[#FFF9EC] p-3"><p class="text-[10px] font-bold uppercase tracking-wide text-[#976511]">Main Gap</p><p class="mt-1 text-sm font-semibold text-surface-800">{{ matchResult.mainGap || '—' }}</p></div>
            </div>
            <div class="rounded-xl border border-surface-200 p-4 text-sm text-surface-600">
              <p class="font-semibold text-[#102A43]">Recruiter judgement remains authoritative</p>
              <p class="mt-1">The percentage is AI decision support, not a rejection decision. If your assessment differs, open Recruiter Screening to validate the candidate through evidence and the live recruiter conversation.</p>
              <p v-if="matchResult.score < matchResult.threshold" class="mt-2 text-xs font-medium text-[#976511]">This candidate is below the {{ matchResult.threshold }}% working-pool threshold, but remains available for manual recruiter validation and is not rejected.</p>
            </div>
          </div>
          <div v-else class="rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm text-warning-800">
            <p class="font-semibold">AI match not available yet</p><p class="mt-1">{{ matchResult.message }}</p><p class="mt-2 text-xs">The candidate is saved. You can still open the Recruitment Workspace for manual review.</p>
          </div>
          <div class="mt-5 flex flex-wrap justify-end gap-2 border-t border-surface-100 pt-4">
            <button type="button" class="rounded-lg border border-surface-300 px-4 py-2 text-sm font-medium" @click="finishAndClose">Done</button>
            <button v-if="completedPayload?.applicationId" type="button" class="rounded-lg bg-[#16847F] px-4 py-2 text-sm font-semibold text-white" @click="openRecruiterScreening">Validate via Recruiter Screening</button>
          </div>
        </div>

        <template v-else>
          <div class="border-b border-surface-200 px-5 pt-4 dark:border-surface-800">
            <div class="flex gap-1 rounded-xl bg-surface-100 p-1 dark:bg-surface-800">
              <button type="button" class="flex-1 rounded-lg px-3 py-2 text-sm font-semibold" :class="mode === 'new' ? 'bg-white text-[#102A43] shadow-sm dark:bg-surface-900 dark:text-white' : 'text-surface-500'" @click="mode = 'new'; resetError()">New Candidate</button>
              <button type="button" class="flex-1 rounded-lg px-3 py-2 text-sm font-semibold" :class="mode === 'existing' ? 'bg-white text-[#102A43] shadow-sm dark:bg-surface-900 dark:text-white' : 'text-surface-500'" @click="mode = 'existing'; resetError()">Existing Candidate</button>
            </div>
          </div>

          <div v-if="applyError" class="mx-5 mt-4 rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">{{ applyError }}</div>

          <div v-if="mode === 'new'" class="overflow-y-auto px-5 py-5">
            <div class="mb-4 flex items-start gap-3 rounded-xl border border-[#CFE0ED] bg-[#F7FBFE] p-4"><UserRoundPlus class="mt-0.5 size-5 text-[#2E86C1]" /><div><p class="text-sm font-semibold text-[#102A43]">Create directly in this requirement</p><p class="mt-1 text-xs leading-5 text-surface-500">Resume parsing prefills detected name, email and phone. Once saved, one controlled AI assessment calculates this candidate's match percentage.</p></div></div>
            <form class="space-y-4" @submit.prevent="createCandidate">
              <label class="block rounded-xl border border-dashed border-[#9FC7DF] bg-[#F7FBFE] p-4 text-sm">
                <span class="flex items-center gap-2 font-semibold text-[#102A43]"><Upload class="size-4 text-[#2E86C1]" />Resume <span class="font-normal text-surface-400">(recommended)</span></span>
                <span class="mt-1 block text-xs text-surface-500">PDF, DOC or DOCX. Candidate identity is parsed locally; AI is used only after save for the match assessment.</span>
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
              <div class="flex justify-end gap-2 border-t border-surface-100 pt-4"><button type="button" :disabled="isApplying" class="rounded-lg border border-surface-300 px-4 py-2 text-sm" @click="emit('close')">Cancel</button><button type="submit" :disabled="isApplying || isParsingResume" class="inline-flex items-center gap-2 rounded-lg bg-[#16847F] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Loader2 v-if="isApplying" class="size-4 animate-spin" /><UserPlus v-else class="size-4" />{{ isApplying ? 'Adding & matching…' : (resumeFile ? 'Add & Calculate Match' : 'Add to Requirement') }}</button></div>
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
            <div class="flex justify-end gap-2 border-t border-surface-200 px-5 py-4"><button type="button" :disabled="isApplying" class="rounded-lg border border-surface-300 px-4 py-2 text-sm" @click="emit('close')">Cancel</button><button type="button" :disabled="isApplying || !selectedExistingCandidateId" class="inline-flex items-center gap-2 rounded-lg bg-[#16847F] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" @click="applyExistingCandidate"><Loader2 v-if="isApplying" class="size-4 animate-spin" /><UserPlus v-else class="size-4" />{{ isApplying ? 'Adding & matching…' : (resumeFile ? 'Add & Calculate Match' : 'Add to Requirement') }}</button></div>
          </template>
        </template>
      </div>
    </div>
  </Teleport>
</template>