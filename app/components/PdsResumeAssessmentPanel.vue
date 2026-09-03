<script setup lang="ts">
import { ClipboardCheck, Loader2, Save, Sparkles } from '@lucide/vue'

const props = defineProps<{
  applicationId: string
  selectedResumeDocumentId?: string | null
  recruitmentStatus?: string | null
}>()

const emit = defineEmits<{ saved: [] }>()
const toast = useToast()
const isSaving = ref(false)
const isAnalyzing = ref(false)

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
const skillAssessment = ref<any[]>([])
const assessmentSource = ref<string | null>(null)
const provisionalFitScore = ref<number | null>(null)
const priority = ref<string | null>(null)

watch(data, (value: any) => {
  const a = value?.assessment
  if (!a) {
    candidateSnapshot.value = ''
    jdAlignment.value = ''
    keyGapsText.value = ''
    verificationAreasText.value = ''
    skillAssessment.value = []
    assessmentSource.value = null
    provisionalFitScore.value = null
    priority.value = null
    return
  }
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
  skillAssessment.value = a.skillAssessment ?? []
  assessmentSource.value = a.source ?? null
  provisionalFitScore.value = a.provisionalFitScore ?? null
  priority.value = a.priority ?? null
}, { immediate: true })

const analysisAllowed = computed(() => Boolean(props.selectedResumeDocumentId) && ['resume_received', 'resume_reviewed', 'reassess'].includes(props.recruitmentStatus ?? ''))

function lines(value: string) {
  return value.split('\n').map(v => v.trim()).filter(Boolean)
}

function evidenceLabel(value?: string) {
  return (value ?? '—').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
}

async function runAiAnalysis() {
  if (!props.selectedResumeDocumentId) return
  if (!analysisAllowed.value) {
    toast.warning('AI analysis not available', 'The current recruitment status does not allow resume assessment.')
    return
  }
  isAnalyzing.value = true
  try {
    const result: any = await $fetch(`/api/applications/${props.applicationId}/resume-assessment/generate`, { method: 'POST' })
    await refresh()
    emit('saved')
    toast.success('AI resume analysis completed', {
      message: `${result?.ranking?.priority ?? ''}${result?.ranking?.provisionalFitScore != null ? ` · Score ${result.ranking.provisionalFitScore}` : ''}`.trim(),
    })
  } catch (err: any) {
    const message = err?.data?.statusMessage ?? err?.message
    toast.error('AI analysis could not be completed', { message })
  } finally {
    isAnalyzing.value = false
  }
}

async function saveAssessment() {
  if (!props.selectedResumeDocumentId) return toast.warning('Select a resume first', 'Choose the resume for this application before assessment.')
  if (!['resume_received', 'resume_reviewed', 'reassess'].includes(props.recruitmentStatus ?? '')) return toast.warning('Assessment not available', 'The current recruitment status does not allow resume assessment.')

  const scores = [mandatoryScore.value, preferredScore.value, experienceScore.value, optionalScore.value]
  const supplied = scores.filter(v => v !== null && v !== undefined).length
  if (supplied !== 0 && supplied !== 4) return toast.warning('Complete all scores', 'Enter all four component scores or leave all four blank.')

  isSaving.value = true
  try {
    await $fetch(`/api/applications/${props.applicationId}/resume-assessment`, {
      method: 'PUT',
      body: {
        candidateSnapshot: candidateSnapshot.value.trim() || null,
        jdAlignment: jdAlignment.value.trim() || null,
        skillAssessment: skillAssessment.value,
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
    toast.success('Assessment adjustments saved')
  } catch (err: any) {
    toast.error('Could not save assessment', { message: err?.data?.statusMessage ?? err?.message })
  } finally { isSaving.value = false }
}
</script>

<template>
  <section class="rounded-xl border border-surface-200 bg-white p-5 dark:border-surface-800 dark:bg-surface-900">
    <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div class="flex items-start gap-2">
        <ClipboardCheck class="mt-0.5 size-4 text-brand-600" />
        <div>
          <div class="flex flex-wrap items-center gap-2"><h2 class="text-sm font-semibold text-surface-800 dark:text-surface-200">AI Candidate Skill Assessment</h2><span v-if="assessmentSource" class="rounded-full bg-surface-100 px-2 py-0.5 text-xs text-surface-600 dark:bg-surface-800">{{ assessmentSource === 'ai' ? 'AI generated' : 'Adjusted manually' }}</span><span v-if="priority" class="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">{{ priority }}</span><span v-if="provisionalFitScore != null" class="text-xs text-surface-500">Score {{ provisionalFitScore }}/100</span></div>
          <p class="mt-1 text-xs text-surface-500">Run AI explicitly to assess the selected resume against the approved Skill Matrix. Screening questions are prepared separately from Recruiter Screening, and opening this page never spends AI credits.</p>
        </div>
      </div>
      <button v-if="selectedResumeDocumentId && analysisAllowed" type="button" :disabled="isAnalyzing || isSaving" class="inline-flex items-center gap-2 rounded-lg border border-brand-300 px-4 py-2 text-sm font-semibold text-brand-700 disabled:opacity-50" @click="runAiAnalysis"><Loader2 v-if="isAnalyzing" class="size-4 animate-spin" /><Sparkles v-else class="size-4" />{{ isAnalyzing ? 'Analyzing…' : (assessmentSource ? 'Run AI Analysis Again' : 'Run AI Resume Analysis') }}</button>
    </div>

    <div v-if="!selectedResumeDocumentId" class="rounded-lg border border-dashed border-surface-300 p-4 text-sm text-surface-500 dark:border-surface-700">Select the resume for this application, then run AI Resume Analysis when you want an assessment.</div>
    <div v-else-if="isAnalyzing && !assessmentSource" class="rounded-lg border border-brand-200 bg-brand-50/50 p-4 text-sm text-brand-800 dark:border-brand-900 dark:bg-brand-950/20 dark:text-brand-200"><span class="inline-flex items-center gap-2"><Loader2 class="size-4 animate-spin" />AI is analysing the resume against the approved Skill Matrix…</span></div>

    <div v-else-if="selectedResumeDocumentId && !assessmentSource" class="rounded-lg border border-dashed border-surface-300 p-4 text-sm text-surface-500 dark:border-surface-700">No AI assessment is available yet. Run AI Resume Analysis explicitly after confirming the Skill Matrix is approved and the selected resume is readable.</div>

    <div v-else class="space-y-4">
      <div class="grid gap-4 md:grid-cols-2">
        <label class="block"><span class="text-xs font-medium text-surface-600 dark:text-surface-300">Candidate Snapshot</span><textarea v-model="candidateSnapshot" rows="4" class="mt-1 w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800" /></label>
        <label class="block"><span class="text-xs font-medium text-surface-600 dark:text-surface-300">JD Alignment</span><textarea v-model="jdAlignment" rows="4" class="mt-1 w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800" /></label>
      </div>

      <div v-if="skillAssessment.length" class="overflow-x-auto rounded-lg border border-surface-200 dark:border-surface-800">
        <table class="min-w-full text-sm"><thead class="bg-surface-50 text-left text-xs uppercase text-surface-500 dark:bg-surface-800/60"><tr><th class="px-3 py-2">Classification</th><th class="px-3 py-2">Skill</th><th class="px-3 py-2">Priority</th><th class="px-3 py-2">Evidence</th><th class="px-3 py-2">Resume Evidence</th></tr></thead><tbody class="divide-y divide-surface-100 dark:divide-surface-800"><tr v-for="(row, index) in skillAssessment" :key="`${row.skill}-${index}`"><td class="px-3 py-2">{{ row.classification || '—' }}</td><td class="px-3 py-2 font-medium">{{ row.skill }}</td><td class="px-3 py-2">{{ evidenceLabel(row.priority) }}</td><td class="px-3 py-2 whitespace-nowrap">{{ evidenceLabel(row.evidenceLevel) }}</td><td class="px-3 py-2 min-w-[280px] text-surface-600 dark:text-surface-300">{{ row.evidence || '—' }}</td></tr></tbody></table>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <label class="block"><span class="text-xs font-medium text-surface-600 dark:text-surface-300">Key Gaps</span><textarea v-model="keyGapsText" rows="3" class="mt-1 w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800" /></label>
        <label class="block"><span class="text-xs font-medium text-surface-600 dark:text-surface-300">Verification Areas</span><textarea v-model="verificationAreasText" rows="3" class="mt-1 w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800" /></label>
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

      <details class="rounded-lg border border-surface-200 p-4 dark:border-surface-800"><summary class="cursor-pointer text-sm font-medium">Manual adjustment</summary><div class="mt-3 flex justify-end"><button type="button" :disabled="isSaving || isAnalyzing" class="inline-flex items-center gap-2 rounded-lg border border-surface-300 px-4 py-2 text-sm font-semibold disabled:opacity-50" @click="saveAssessment"><Loader2 v-if="isSaving" class="size-4 animate-spin" /><Save v-else class="size-4" />{{ isSaving ? 'Saving…' : 'Save Adjustments' }}</button></div></details>
    </div>
  </section>
</template>
