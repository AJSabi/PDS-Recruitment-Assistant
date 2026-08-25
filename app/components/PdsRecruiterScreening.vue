<script setup lang="ts">
import { Loader2, Sparkles } from 'lucide-vue-next'

const props = defineProps<{ applicationId: string; enabled: boolean }>()
const emit = defineEmits<{ changed: [] }>()
const toast = useToast()

const { data, refresh } = useFetch(() => `/api/applications/${props.applicationId}/screening`, {
  key: computed(() => `pds-screening-${props.applicationId}`),
  headers: useRequestHeaders(['cookie']),
})

const questionText = ref('')
const generatedQuestions = ref<any[]>([])
const answer = ref('')
const busy = ref(false)
const aiGenerating = ref(false)
const aiInterpreting = ref(false)
const finalFit = ref('potential_fit')
const recommendedNextStep = ref('proceed_to_hiring_manager_round')
const conversationBrief = ref('')
const validationFocusText = ref('')
const aiRationale = ref('')

const screening = computed<any>(() => data.value?.screening ?? null)
const currentQuestion = computed<any>(() => data.value?.currentQuestion ?? null)
const progress = computed<any>(() => data.value?.progress ?? { answered: 0, total: 0 })
const readyToComplete = computed(() => Boolean(data.value?.readyToComplete))

watch(screening, (value: any) => {
  if (value?.status === 'not_started' && Array.isArray(value.questions) && value.questions.length) {
    generatedQuestions.value = value.questions
  }
}, { immediate: true, deep: true })

function lines(value: string) {
  return value.split('\n').map(v => v.trim()).filter(Boolean)
}

async function generateQuestions() {
  aiGenerating.value = true
  try {
    const result: any = await $fetch(`/api/applications/${props.applicationId}/screening/generate`, { method: 'POST' })
    generatedQuestions.value = result.questions ?? []
    await refresh()
    toast.success('AI screening questions generated', { message: `${generatedQuestions.value.length} candidate-specific questions are ready.` })
  } catch (err: any) {
    toast.error('Could not generate screening questions', { message: err?.data?.statusMessage ?? err?.message })
  } finally { aiGenerating.value = false }
}

async function startScreening(useAi = false) {
  const manual = lines(questionText.value).slice(0, 10).map((q, i) => ({ id: `q${i + 1}`, question: q }))
  const qs = useAi ? generatedQuestions.value : manual
  if (!qs.length) return toast.warning('Add screening questions', 'AI questions should be generated from the candidate assessment, or enter manual questions as an override.')
  busy.value = true
  try {
    await $fetch(`/api/applications/${props.applicationId}/screening/start`, { method: 'POST', body: { questions: qs } })
    await refresh()
    emit('changed')
    toast.success('Recruiter screening started')
  } catch (err: any) {
    toast.error('Could not start screening', { message: err?.data?.statusMessage ?? err?.message })
  } finally { busy.value = false }
}

async function submitAnswer() {
  if (!currentQuestion.value || !answer.value.trim()) return
  busy.value = true
  try {
    await $fetch(`/api/applications/${props.applicationId}/screening/answer`, { method: 'POST', body: { questionId: currentQuestion.value.id, answer: answer.value.trim() } })
    answer.value = ''
    await refresh()
    emit('changed')
  } catch (err: any) {
    toast.error('Could not save answer', { message: err?.data?.statusMessage ?? err?.message })
  } finally { busy.value = false }
}

async function getAiInterpretation() {
  aiInterpreting.value = true
  try {
    const result: any = await $fetch(`/api/applications/${props.applicationId}/screening/interpret`, { method: 'POST' })
    const s = result.suggestion
    finalFit.value = s.finalFit
    recommendedNextStep.value = s.recommendedNextStep
    conversationBrief.value = s.conversationBrief
    validationFocusText.value = (s.validationFocus ?? []).join('\n')
    aiRationale.value = s.rationale ?? ''
    toast.success('AI screening recommendation prepared', { message: 'Review it before confirming screening completion.' })
  } catch (err: any) {
    toast.error('Could not interpret screening', { message: err?.data?.statusMessage ?? err?.message })
  } finally { aiInterpreting.value = false }
}

async function completeScreening() {
  busy.value = true
  try {
    await $fetch(`/api/applications/${props.applicationId}/screening/complete`, {
      method: 'POST',
      body: {
        finalFit: finalFit.value,
        recommendedNextStep: recommendedNextStep.value,
        conversationBrief: conversationBrief.value || null,
        validationFocus: lines(validationFocusText.value).slice(0, 5),
      },
    })
    await refresh()
    emit('changed')
    toast.success('Recruiter screening completed')
  } catch (err: any) {
    toast.error('Could not complete screening', { message: err?.data?.statusMessage ?? err?.message })
  } finally { busy.value = false }
}
</script>

<template>
  <section class="rounded-xl border border-surface-200 bg-white p-5 dark:border-surface-800 dark:bg-surface-900">
    <div class="mb-4"><h2 class="text-sm font-semibold text-surface-800 dark:text-surface-200">Recruiter Screening</h2><p class="mt-1 text-xs text-surface-500">Candidate-specific questions are generated automatically from the JD, approved Skill Matrix and AI resume Skill Assessment. The recruiter conducts and confirms the screening.</p></div>

    <div v-if="!enabled && screening?.status === 'not_started'" class="rounded-lg border border-dashed border-surface-300 p-4 text-sm text-surface-500 dark:border-surface-700">AI resume/skill assessment must complete before recruiter screening questions are available.</div>

    <div v-else-if="screening?.status === 'not_started'" class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-200 bg-brand-50/50 p-4 dark:border-brand-900 dark:bg-brand-950/20">
        <div><p class="text-sm font-semibold">AI Screening Questions</p><p class="mt-1 text-xs text-surface-500">These questions should appear automatically after AI candidate assessment. Regenerate only when you need a fresh set.</p></div>
        <button :disabled="aiGenerating || busy" class="inline-flex items-center gap-2 rounded-lg border border-brand-300 px-4 py-2 text-sm font-semibold text-brand-700 disabled:opacity-50" @click="generateQuestions"><Loader2 v-if="aiGenerating" class="size-4 animate-spin" /><Sparkles v-else class="size-4" />{{ aiGenerating ? 'Generating…' : (generatedQuestions.length ? 'Regenerate Questions' : 'Generate Questions') }}</button>
      </div>

      <div v-if="generatedQuestions.length" class="space-y-2">
        <div v-for="(q, i) in generatedQuestions" :key="q.id" class="rounded-lg border border-surface-200 p-3 dark:border-surface-800"><div class="text-sm font-medium">{{ i + 1 }}. {{ q.question }}</div><div v-if="q.verificationArea" class="mt-1 text-xs text-surface-500">Validates: {{ q.verificationArea }}</div><div v-if="q.options?.length" class="mt-2 flex flex-wrap gap-1.5"><span v-for="option in q.options" :key="option" class="rounded-full bg-surface-100 px-2 py-1 text-xs text-surface-600 dark:bg-surface-800">{{ option }}</span></div></div>
        <div class="flex justify-end"><button :disabled="busy" class="rounded-lg bg-success-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" @click="startScreening(true)">Start Recruiter Screening</button></div>
      </div>
      <div v-else class="rounded-lg border border-dashed border-surface-300 p-4 text-sm text-surface-500 dark:border-surface-700">No AI questions are stored yet. This normally means the candidate AI assessment has not completed successfully.</div>

      <details class="rounded-lg border border-surface-200 p-4 dark:border-surface-800"><summary class="cursor-pointer text-sm font-medium">Manual override</summary><div class="mt-3 space-y-3"><textarea v-model="questionText" rows="6" class="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800" placeholder="Enter one question per line. Up to 10 questions." /><div class="flex justify-end"><button :disabled="busy" class="rounded-lg border border-surface-300 px-4 py-2 text-sm font-semibold disabled:opacity-50" @click="startScreening(false)">Start with Manual Questions</button></div></div></details>
    </div>

    <div v-else-if="screening?.status === 'in_progress'" class="space-y-4">
      <div class="text-xs text-surface-500">Question {{ Math.min(progress.answered + 1, progress.total) }} of {{ progress.total }}</div>
      <template v-if="currentQuestion">
        <div class="rounded-lg bg-surface-50 p-4 text-sm font-medium text-surface-800 dark:bg-surface-800/60 dark:text-surface-100">{{ currentQuestion.question }}<div v-if="currentQuestion.verificationArea" class="mt-2 text-xs font-normal text-surface-500">Validation focus: {{ currentQuestion.verificationArea }}</div></div>
        <div v-if="currentQuestion.options?.length" class="flex flex-wrap gap-2"><button v-for="option in currentQuestion.options" :key="option" class="rounded-lg border border-surface-300 px-3 py-1.5 text-xs hover:border-brand-400 hover:text-brand-700" @click="answer = option">{{ option }}</button></div>
        <textarea v-model="answer" rows="3" class="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800" placeholder="Select an option or record the candidate's exact response" />
        <div class="flex justify-end"><button :disabled="busy || !answer.trim()" class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" @click="submitAnswer">Save & Next</button></div>
      </template>

      <div v-if="readyToComplete" class="space-y-3 rounded-lg border border-surface-200 p-4 dark:border-surface-700">
        <div class="flex flex-wrap items-center justify-between gap-2"><div><h3 class="text-sm font-semibold">Complete Screening</h3><p class="mt-1 text-xs text-surface-500">AI may recommend the fit and next step. Recruiter confirmation is still required.</p></div><button :disabled="aiInterpreting || busy" class="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" @click="getAiInterpretation"><Loader2 v-if="aiInterpreting" class="size-4 animate-spin" /><Sparkles v-else class="size-4" />{{ aiInterpreting ? 'Interpreting…' : 'Get AI Recommendation' }}</button></div>
        <div v-if="aiRationale" class="rounded-lg bg-brand-50 p-3 text-xs text-brand-900 dark:bg-brand-950/30 dark:text-brand-200"><strong>AI rationale:</strong> {{ aiRationale }}</div>
        <div class="grid gap-3 sm:grid-cols-2">
          <div><label class="mb-1 block text-xs font-medium">Final Fit</label><select v-model="finalFit" class="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800"><option value="strong_fit">Strong Fit</option><option value="potential_fit">Potential Fit</option><option value="borderline_requires_validation">Borderline / Requires Validation</option><option value="significant_gap">Significant Gap</option></select></div>
          <div><label class="mb-1 block text-xs font-medium">Recommended Next Step</label><select v-model="recommendedNextStep" class="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800"><option value="proceed_to_hiring_manager_round">Proceed to Hiring Manager Round</option><option value="hold_for_comparison">Hold for Comparison</option><option value="reassess">Reassess</option><option value="recruiter_decision_required">Recruiter Decision Required</option></select></div>
        </div>
        <div><label class="mb-1 block text-xs font-medium">Conversation Brief</label><textarea v-model="conversationBrief" rows="3" class="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800" /></div>
        <div><label class="mb-1 block text-xs font-medium">Hiring Manager Validation Focus</label><textarea v-model="validationFocusText" rows="3" class="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800" placeholder="One item per line" /></div>
        <div class="flex justify-end"><button :disabled="busy || aiInterpreting" class="rounded-lg bg-success-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" @click="completeScreening">Confirm & Complete Screening</button></div>
      </div>
    </div>

    <div v-else-if="screening?.status === 'completed'" class="rounded-lg bg-success-50 p-4 text-sm text-success-800 dark:bg-success-950/30 dark:text-success-300">Screening completed. Final fit: <strong>{{ screening.finalFit }}</strong>. Recommended next step: <strong>{{ screening.recommendedNextStep }}</strong>.</div>
  </section>
</template>
