<script setup lang="ts">
import { ClipboardCheck, Loader2, Save } from 'lucide-vue-next'

const props = defineProps<{
  applicationId: string
  selectedResumeDocumentId?: string | null
  recruitmentStatus?: string | null
}>()

const emit = defineEmits<{ saved: [] }>()
const toast = useToast()
const isSaving = ref(false)

const { data, refresh } = useFetch(() => `/api/applications/${props.applicationId}/resume-assessment`, {
  key: computed(() => `pds-resume-assessment-${props.applicationId}`),
  headers: useRequestHeaders(['cookie']),
})

const candidateSnapshot = ref('')
const jdAlignment = ref('')
const keyGapsText = ref('')
const verificationAreasText = ref('')
const mandatoryScore = ref<number | null>(null)
const preferredScore = ref<number | null>(null)
const experienceScore = ref<number | null>(null)
const optionalScore = ref<number | null>(null)
const mandatoryMatch = ref('')
const keyStrength = ref('')
const mainGap = ref('')

watch(data, (value: any) => {
  const a = value?.assessment
  if (!a) return
  candidateSnapshot.value = a.candidateSnapshot ?? ''
  jdAlignment.value = a.jdAlignment ?? ''
  keyGapsText.value = (a.keyGaps ?? []).join('\n')
  verificationAreasText.value = (a.verificationAreas ?? []).join('\n')
  mandatoryScore.value = a.mandatoryScore ?? null
  preferredScore.value = a.preferredScore ?? null
  experienceScore.value = a.experienceScore ?? null
  optionalScore.value = a.optionalScore ?? null
  mandatoryMatch.value = a.mandatoryMatch ?? ''
  keyStrength.value = a.keyStrength ?? ''
  mainGap.value = a.mainGap ?? ''
}, { immediate: true })

function lines(value: string) {
  return value.split('\n').map(v => v.trim()).filter(Boolean)
}

async function saveAssessment() {
  if (!props.selectedResumeDocumentId) {
    return toast.warning('Select a resume first', 'Choose the resume for this application before assessment.')
  }
  if (!['resume_received', 'resume_reviewed', 'reassess'].includes(props.recruitmentStatus ?? '')) {
    return toast.warning('Assessment not available', 'The current recruitment status does not allow resume assessment.')
  }

  const scores = [mandatoryScore.value, preferredScore.value, experienceScore.value, optionalScore.value]
  const supplied = scores.filter(v => v !== null && v !== undefined).length
  if (supplied !== 0 && supplied !== 4) {
    return toast.warning('Complete all scores', 'Enter all four component scores or leave all four blank.')
  }

  isSaving.value = true
  try {
    await $fetch(`/api/applications/${props.applicationId}/resume-assessment`, {
      method: 'PUT',
      body: {
        candidateSnapshot: candidateSnapshot.value.trim() || null,
        jdAlignment: jdAlignment.value.trim() || null,
        skillAssessment: [],
        keyGaps: lines(keyGapsText.value),
        verificationAreas: lines(verificationAreasText.value),
        mandatoryScore: mandatoryScore.value,
        preferredScore: preferredScore.value,
        experienceScore: experienceScore.value,
        optionalScore: optionalScore.value,
        mandatoryMatch: mandatoryMatch.value.trim() || null,
        keyStrength: keyStrength.value.trim() || null,
        mainGap: mainGap.value.trim() || null,
        source: 'manual',
      },
    })
    await refresh()
    emit('saved')
    toast.success('Resume assessment saved')
  } catch (err: any) {
    toast.error('Could not save assessment', { message: err?.data?.statusMessage ?? err?.message })
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <section class="rounded-xl border border-surface-200 bg-white p-5 dark:border-surface-800 dark:bg-surface-900">
    <div class="mb-4 flex items-start gap-2">
      <ClipboardCheck class="mt-0.5 size-4 text-brand-600" />
      <div>
        <h2 class="text-sm font-semibold text-surface-800 dark:text-surface-200">Resume Assessment</h2>
        <p class="mt-1 text-xs text-surface-500">Manual framework for now. Copilot can later populate the same fields and evidence structure.</p>
      </div>
    </div>

    <div v-if="!selectedResumeDocumentId" class="rounded-lg border border-dashed border-surface-300 p-4 text-sm text-surface-500 dark:border-surface-700">
      Select a resume for this application before assessment.
    </div>

    <div v-else class="space-y-4">
      <div class="grid gap-4 md:grid-cols-2">
        <label class="block">
          <span class="text-xs font-medium text-surface-600 dark:text-surface-300">Candidate Snapshot</span>
          <textarea v-model="candidateSnapshot" rows="4" class="mt-1 w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800" placeholder="Brief resume-based candidate summary" />
        </label>
        <label class="block">
          <span class="text-xs font-medium text-surface-600 dark:text-surface-300">JD Alignment</span>
          <textarea v-model="jdAlignment" rows="4" class="mt-1 w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800" placeholder="How the resume aligns with the active JD" />
        </label>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <label class="block">
          <span class="text-xs font-medium text-surface-600 dark:text-surface-300">Key Gaps</span>
          <textarea v-model="keyGapsText" rows="3" class="mt-1 w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800" placeholder="One gap per line" />
        </label>
        <label class="block">
          <span class="text-xs font-medium text-surface-600 dark:text-surface-300">Verification Areas</span>
          <textarea v-model="verificationAreasText" rows="3" class="mt-1 w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800" placeholder="One verification area per line" />
        </label>
      </div>

      <div class="grid gap-3 sm:grid-cols-4">
        <label class="block"><span class="text-xs text-surface-500">Mandatory %</span><input v-model.number="mandatoryScore" type="number" min="0" max="100" class="mt-1 w-full rounded-lg border border-surface-300 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800" /></label>
        <label class="block"><span class="text-xs text-surface-500">Preferred %</span><input v-model.number="preferredScore" type="number" min="0" max="100" class="mt-1 w-full rounded-lg border border-surface-300 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800" /></label>
        <label class="block"><span class="text-xs text-surface-500">Experience %</span><input v-model.number="experienceScore" type="number" min="0" max="100" class="mt-1 w-full rounded-lg border border-surface-300 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800" /></label>
        <label class="block"><span class="text-xs text-surface-500">Optional %</span><input v-model.number="optionalScore" type="number" min="0" max="100" class="mt-1 w-full rounded-lg border border-surface-300 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800" /></label>
      </div>

      <div class="grid gap-4 md:grid-cols-3">
        <label class="block"><span class="text-xs font-medium text-surface-600 dark:text-surface-300">Mandatory Match</span><input v-model="mandatoryMatch" class="mt-1 w-full rounded-lg border border-surface-300 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800" /></label>
        <label class="block"><span class="text-xs font-medium text-surface-600 dark:text-surface-300">Key Strength</span><input v-model="keyStrength" class="mt-1 w-full rounded-lg border border-surface-300 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800" /></label>
        <label class="block"><span class="text-xs font-medium text-surface-600 dark:text-surface-300">Main Gap</span><input v-model="mainGap" class="mt-1 w-full rounded-lg border border-surface-300 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800" /></label>
      </div>

      <div class="flex justify-end">
        <button type="button" :disabled="isSaving" class="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50" @click="saveAssessment">
          <Loader2 v-if="isSaving" class="size-4 animate-spin" />
          <Save v-else class="size-4" />
          {{ isSaving ? 'Saving…' : 'Save Resume Assessment' }}
        </button>
      </div>
    </div>
  </section>
</template>
