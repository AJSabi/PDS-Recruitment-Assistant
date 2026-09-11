<script setup lang="ts">
import { ArrowLeft, Loader2, PhoneCall, Plus, Save, Sparkles, Trash2 } from '@lucide/vue'

const props = defineProps<{ applicationId: string; enabled: boolean; recruitmentStatus?: string | null }>()
const emit = defineEmits<{ changed: [] }>()
const toast = useToast()

type ScreeningFollowUp = { whenOption: string; question: string; options?: string[]; verificationArea?: string }
type ScreeningQuestion = { id: string; question: string; options?: string[]; verificationArea?: string; followUps?: ScreeningFollowUp[] }

const { data, refresh } = useFetch(() => `/api/applications/${props.applicationId}/screening`, {
  key: computed(() => `pds-screening-${props.applicationId}`),
  headers: useRequestHeaders(['cookie']),
})

const questionText = ref('')
const generatedQuestions = ref<ScreeningQuestion[]>([])
const liveQuestions = ref<ScreeningQuestion[]>([])
const answer = ref('')
const selectedOption = ref('')
const exactAnswer = ref('')
const busy = ref(false)
const aiGenerating = ref(false)
const aiInterpreting = ref(false)
const savingQuestionPlan = ref(false)
const finalFit = ref('potential_fit')
const recommendedNextStep = ref('proceed_to_hiring_manager_round')
const conversationBrief = ref('')
const validationFocusText = ref('')
const aiRationale = ref('')

const screening = computed<any>(() => data.value?.screening ?? null)
const currentQuestion = computed<any>(() => data.value?.currentQuestion ?? null)
const progress = computed<any>(() => data.value?.progress ?? { answered: 0, total: 0 })
const readyToComplete = computed(() => Boolean(data.value?.readyToComplete))
const answeredIds = computed(() => new Set((screening.value?.responses ?? []).map((r: any) => r.questionId)))
const reassessmentMode = computed(() => props.recruitmentStatus === 'reassess')
const showPreparation = computed(() => screening.value?.status === 'not_started' || (reassessmentMode.value && screening.value?.status === 'completed'))
const otherSelected = computed(() => /other|exact response/i.test(selectedOption.value))
const responseReady = computed(() => currentQuestion.value?.options?.length
  ? Boolean(selectedOption.value && (!otherSelected.value || exactAnswer.value.trim()))
  : Boolean(answer.value.trim()))
const canGoBack = computed(() => screening.value?.status === 'in_progress' && (screening.value?.responses?.length ?? 0) > 0)

watch(screening, (value: any) => {
  if (!value) return
  if (value.status === 'not_started' && Array.isArray(value.questions) && value.questions.length) {
    generatedQuestions.value = value.questions.map((q: ScreeningQuestion) => ({ ...q, options: q.options ? [...q.options] : undefined }))
  }
  if (value.status === 'in_progress' && Array.isArray(value.questions)) {
    liveQuestions.value = value.questions.map((q: ScreeningQuestion) => ({ ...q, options: q.options ? [...q.options] : undefined }))
  }
}, { immediate: true, deep: true })

watch(() => currentQuestion.value?.id, () => {
  answer.value = ''
  selectedOption.value = ''
  exactAnswer.value = ''
})

function lines(value: string) {
  return value.split('\n').map(v => v.trim()).filter(Boolean)
}

async function chooseOption(option: string) {
  if (busy.value) return
  selectedOption.value = option
  if (/other|exact response/i.test(option)) return
  exactAnswer.value = ''
  await nextTick()
  await submitAnswer(option)
}

function capturedAnswer(override?: string) {
  if (override) return override
  if (!currentQuestion.value?.options?.length) return answer.value.trim()
  return otherSelected.value ? `${selectedOption.value}: ${exactAnswer.value.trim()}` : selectedOption.value
}

function addDraftQuestion(target: 'generated' | 'live') {
  const list = target === 'generated' ? generatedQuestions.value : liveQuestions.value
  if (list.length >= 10) return toast.warning('Maximum 10 questions', 'Keep the recruiter call focused to 10 questions or fewer.')
  list.push({ id: `manual_${Date.now()}_${list.length + 1}`, question: '', options: [], verificationArea: '' })
}

function removeDraftQuestion(target: 'generated' | 'live', index: number) {
  const list = target === 'generated' ? generatedQuestions.value : liveQuestions.value
  const question = list[index]
  if (target === 'live' && question && answeredIds.value.has(question.id)) return toast.warning('Question already answered', 'Use Back during the live call if you need to revisit the most recent response.')
  list.splice(index, 1)
}

function cleanQuestions(list: ScreeningQuestion[]) {
  return list.map(q => ({
    ...q,
    question: q.question.trim(),
    verificationArea: q.verificationArea?.trim() || undefined,
    options: q.options?.map(option => option.trim()).filter(Boolean),
    followUps: q.followUps?.map(f => ({
      ...f,
      whenOption: f.whenOption.trim(),
      question: f.question.trim(),
      verificationArea: f.verificationArea?.trim() || undefined,
      options: f.options?.map(option => option.trim()).filter(Boolean),
    })).filter(f => f.whenOption && f.question),
  })).filter(q => q.question).slice(0, 10)
}

async function generateQuestions() {
  aiGenerating.value = true
  try {
    const result: any = await $fetch(`/api/applications/${props.applicationId}/screening/generate`, { method: 'POST' })
    generatedQuestions.value = (result.questions ?? []).map((q: ScreeningQuestion) => ({ ...q, options: q.options ? [...q.options] : undefined }))
    toast.success('Call preparation questions generated', { message: `${generatedQuestions.value.length} candidate-specific MCQ-first questions are ready. Follow-ups will branch from the candidate's answers where needed.` })
  } catch (err: any) {
    toast.error('Could not generate screening questions', { message: err?.data?.statusMessage ?? err?.message })
  } finally { aiGenerating.value = false }
}

async function startScreening(useAi = false) {
  const manual = lines(questionText.value).slice(0, 10).map((q, i) => ({ id: `q${i + 1}`, question: q }))
  const qs = useAi ? cleanQuestions(generatedQuestions.value) : manual
  if (!qs.length) return toast.warning('Add screening questions', 'Prepare up to 10 questions before starting the recruiter call.')
  busy.value = true
  try {
    await $fetch(`/api/applications/${props.applicationId}/screening/start`, { method: 'POST', body: { questions: qs } })
    await refresh()
    emit('changed')
    await nextTick()
    document.getElementById('recruiter-screening')?.scrollIntoView({ block: 'start' })
    toast.success(reassessmentMode.value ? 'Revalidation screening started' : 'Recruiter call started', { message: 'Select a response to move directly to the next question. Use Back to revisit the previous response.' })
  } catch (err: any) {
    toast.error('Could not start recruiter screening', { message: err?.data?.statusMessage ?? err?.message })
  } finally { busy.value = false }
}

async function saveLiveQuestionPlan() {
  const questions = cleanQuestions(liveQuestions.value)
  if (!questions.length) return toast.warning('Keep at least one question', 'A screening session needs at least one question.')
  savingQuestionPlan.value = true
  try {
    await $fetch(`/api/applications/${props.applicationId}/screening/questions`, { method: 'PATCH', body: { questions } })
    await refresh()
    toast.success('Remaining questions updated', { message: 'Answered questions were preserved.' })
  } catch (err: any) {
    toast.error('Could not update screening questions', { message: err?.data?.statusMessage ?? err?.message })
  } finally { savingQuestionPlan.value = false }
}

async function submitAnswer(override?: string) {
  if (!currentQuestion.value) return
  const response = capturedAnswer(override)
  if (!response) return
  busy.value = true
  try {
    const result: any = await $fetch(`/api/applications/${props.applicationId}/screening/answer`, {
      method: 'POST',
      body: { questionId: currentQuestion.value.id, answer: response },
    })
    await refresh()
    if (result.adaptiveFollowUpAdded) toast.info('Follow-up adapted', 'The next question was adjusted based on the candidate response.')
  } catch (err: any) {
    toast.error('Could not save answer', { message: err?.data?.statusMessage ?? err?.message })
  } finally { busy.value = false }
}

async function goBack() {
  if (!canGoBack.value || busy.value) return
  busy.value = true
  try {
    await $fetch(`/api/applications/${props.applicationId}/screening/back`, { method: 'POST' })
    await refresh()
    await nextTick()
    document.getElementById('recruiter-screening')?.scrollIntoView({ block: 'start' })
  } catch (err: any) {
    toast.error('Could not go back', { message: err?.data?.statusMessage ?? err?.message })
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
      body: { finalFit: finalFit.value, recommendedNextStep: recommendedNextStep.value, conversationBrief: conversationBrief.value || null, validationFocus: lines(validationFocusText.value).slice(0, 5) },
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
  <section id="recruiter-screening" class="scroll-mt-4 rounded-xl border border-surface-200 bg-white p-5 dark:border-surface-800 dark:bg-surface-900">
    <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="flex items-center gap-2"><PhoneCall class="size-4 text-[#16847F]" /><h2 class="text-sm font-semibold text-surface-800 dark:text-surface-200">{{ reassessmentMode ? 'Recruiter Revalidation Screening' : 'Recruiter Screening Call' }}</h2></div>
        <p class="mt-1 max-w-3xl text-xs text-surface-500">MCQ-first capture is used wherever practical. Selecting a standard option saves it and advances immediately; conditional follow-ups can branch from the selected response.</p>
      </div>
    </div>

    <div v-if="!enabled && screening?.status === 'not_started'" class="rounded-lg border border-dashed border-surface-300 p-4 dark:border-surface-700">
      <p class="text-sm font-semibold text-surface-700 dark:text-surface-200">Screening preparation is waiting for the resume assessment.</p>
      <p class="mt-1 text-xs text-surface-500">Complete the resume assessment first.</p>
    </div>

    <div v-else-if="showPreparation" class="space-y-4">
      <div v-if="reassessmentMode" class="rounded-lg border border-warning-200 bg-warning-50 p-4 text-sm text-warning-800"><p class="font-semibold">Revalidation required</p><p class="mt-1 text-xs">The previous screening remains preserved in Candidate History. Prepare a fresh question set focused on what needs reassessment.</p></div>
      <div class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-200 bg-brand-50/50 p-4 dark:border-brand-900 dark:bg-brand-950/20">
        <div><p class="text-sm font-semibold">{{ reassessmentMode ? 'Prepare Revalidation Questions' : 'Prepare Recruiter Call' }}</p><p class="mt-1 text-xs text-surface-500">AI prepares 5-8 MCQ-first questions with conditional follow-ups where an answer changes the validation path.</p></div>
        <button :disabled="aiGenerating || busy" class="inline-flex items-center gap-2 rounded-lg bg-[#2E86C1] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" @click="generateQuestions"><Loader2 v-if="aiGenerating" class="size-4 animate-spin" /><Sparkles v-else class="size-4" />{{ aiGenerating ? 'Preparing…' : (generatedQuestions.length ? 'Regenerate Questions' : 'Prepare Questions with AI') }}</button>
      </div>

      <div v-if="generatedQuestions.length" class="space-y-2">
        <div v-for="(q, i) in generatedQuestions" :key="q.id" class="rounded-lg border border-surface-200 p-3 dark:border-surface-800">
          <div class="flex items-start gap-2"><span class="mt-2 text-xs font-bold text-surface-400">{{ i + 1 }}.</span><div class="min-w-0 flex-1"><textarea v-model="q.question" rows="2" class="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm font-medium dark:border-surface-700 dark:bg-surface-800" /><input v-model="q.verificationArea" class="mt-2 w-full rounded-lg border border-surface-200 px-3 py-1.5 text-xs dark:border-surface-700 dark:bg-surface-800" placeholder="Validation focus (optional)" /><div v-if="q.options?.length" class="mt-2 flex flex-wrap gap-1.5"><span v-for="option in q.options" :key="option" class="rounded-full bg-surface-100 px-2 py-1 text-xs text-surface-600 dark:bg-surface-800">{{ option }}</span></div></div><button type="button" class="mt-1 rounded-lg p-2 text-surface-400 hover:bg-danger-50 hover:text-danger-600" @click="removeDraftQuestion('generated', i)"><Trash2 class="size-4" /></button></div>
        </div>
        <div class="flex flex-wrap justify-between gap-2"><button v-if="generatedQuestions.length < 10" type="button" class="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-surface-300 px-3 py-2 text-sm font-semibold text-surface-600" @click="addDraftQuestion('generated')"><Plus class="size-4" />Add Question</button><button :disabled="busy" class="rounded-lg bg-[#16847F] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" @click="startScreening(true)"><PhoneCall class="mr-1 inline size-4" />{{ reassessmentMode ? 'Start Revalidation Call' : 'Start Recruiter Call' }}</button></div>
      </div>
      <div v-else class="rounded-lg border border-dashed border-surface-300 p-4 text-sm text-surface-500 dark:border-surface-700">No prepared questions yet. Use AI preparation above, or Manual Override.</div>

      <details class="rounded-lg border border-surface-200 p-4 dark:border-surface-800"><summary class="cursor-pointer text-sm font-medium">Manual Override</summary><div class="mt-3 space-y-3"><textarea v-model="questionText" rows="6" class="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800" placeholder="Enter one question per line. Up to 10 questions." /><div class="flex justify-end"><button :disabled="busy" class="rounded-lg border border-surface-300 px-4 py-2 text-sm font-semibold disabled:opacity-50" @click="startScreening(false)">Start with Manual Questions</button></div></div></details>
    </div>

    <div v-else-if="screening?.status === 'in_progress'" class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-3"><button v-if="canGoBack" type="button" :disabled="busy" class="inline-flex items-center gap-1 rounded-lg border border-surface-300 px-2.5 py-1.5 text-xs font-semibold text-surface-600 disabled:opacity-50" @click="goBack"><ArrowLeft class="size-3.5" />Back</button><div class="text-xs text-surface-500">Recruiter call in progress · Question {{ Math.min(progress.answered + 1, progress.total) }} of {{ progress.total }}</div></div>
        <span class="rounded-full bg-[#E9F8F6] px-2.5 py-1 text-xs font-semibold text-[#13756F]">Live screening</span>
      </div>
      <template v-if="currentQuestion">
        <div class="rounded-lg bg-surface-50 p-4 text-sm font-medium text-surface-800 dark:bg-surface-800/60 dark:text-surface-100">{{ currentQuestion.question }}<div v-if="currentQuestion.verificationArea" class="mt-2 text-xs font-normal text-surface-500">Validation focus: {{ currentQuestion.verificationArea }}</div></div>
        <div v-if="currentQuestion.options?.length" class="grid gap-2 sm:grid-cols-2"><button v-for="option in currentQuestion.options" :key="option" type="button" :disabled="busy" class="rounded-lg border px-3 py-2 text-left text-sm transition disabled:opacity-50" :class="selectedOption === option ? 'border-[#16847F] bg-[#E9F8F6] font-semibold text-[#13756F]' : 'border-surface-300 hover:border-[#16847F]'" @click="chooseOption(option)">{{ option }}</button></div>
        <textarea v-if="!currentQuestion.options?.length" v-model="answer" rows="3" class="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800" placeholder="Record the candidate response" />
        <textarea v-else-if="otherSelected" v-model="exactAnswer" rows="2" class="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800" placeholder="Capture the exact response" />
        <div v-if="!currentQuestion.options?.length || otherSelected" class="flex justify-end"><button :disabled="busy || !responseReady" class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" @click="submitAnswer()">Next Question</button></div>
      </template>

      <details class="rounded-lg border border-surface-200 p-4 dark:border-surface-800"><summary class="cursor-pointer text-sm font-semibold">Adjust unanswered questions</summary><p class="mt-2 text-xs text-surface-500">Use Back for the most recent answered question. Future questions may still be edited here, while adaptive follow-ups are inserted automatically from the selected response.</p><div class="mt-3 space-y-2"><div v-for="(q, i) in liveQuestions" :key="q.id" class="flex items-start gap-2 rounded-lg border border-surface-200 p-2 dark:border-surface-700" :class="answeredIds.has(q.id) ? 'opacity-60' : ''"><span class="mt-2 text-xs font-bold text-surface-400">{{ i + 1 }}.</span><div class="min-w-0 flex-1"><textarea v-model="q.question" :disabled="answeredIds.has(q.id)" rows="2" class="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm disabled:bg-surface-100 dark:border-surface-700 dark:bg-surface-800" /><input v-model="q.verificationArea" :disabled="answeredIds.has(q.id)" class="mt-1 w-full rounded-lg border border-surface-200 px-3 py-1.5 text-xs disabled:bg-surface-100 dark:border-surface-700 dark:bg-surface-800" placeholder="Validation focus" /></div><button v-if="!answeredIds.has(q.id)" type="button" class="mt-1 rounded-lg p-2 text-surface-400 hover:bg-danger-50 hover:text-danger-600" @click="removeDraftQuestion('live', i)"><Trash2 class="size-4" /></button></div><div class="flex flex-wrap justify-between gap-2"><button v-if="liveQuestions.length < 10" type="button" class="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-surface-300 px-3 py-2 text-sm font-semibold text-surface-600" @click="addDraftQuestion('live')"><Plus class="size-4" />Add Follow-up Question</button><button :disabled="savingQuestionPlan" type="button" class="inline-flex items-center gap-1.5 rounded-lg border border-brand-300 px-3 py-2 text-sm font-semibold text-brand-700 disabled:opacity-50" @click="saveLiveQuestionPlan"><Loader2 v-if="savingQuestionPlan" class="size-4 animate-spin" /><Save v-else class="size-4" />Save Question Plan</button></div></div></details>

      <div v-if="readyToComplete" class="space-y-3 rounded-lg border border-surface-200 p-4 dark:border-surface-700">
        <div class="flex flex-wrap items-center justify-between gap-2"><div><h3 class="text-sm font-semibold">Complete Recruiter Screening</h3><p class="mt-1 text-xs text-surface-500">You can still use Back before completing. AI may suggest the fit and next step, but recruiter confirmation remains mandatory.</p></div><button :disabled="aiInterpreting || busy" class="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" @click="getAiInterpretation"><Loader2 v-if="aiInterpreting" class="size-4 animate-spin" /><Sparkles v-else class="size-4" />{{ aiInterpreting ? 'Interpreting…' : 'Get AI Recommendation' }}</button></div>
        <div v-if="aiRationale" class="rounded-lg bg-brand-50 p-3 text-xs text-brand-900"><strong>AI rationale:</strong> {{ aiRationale }}</div>
        <div class="grid gap-3 sm:grid-cols-2"><div><label class="mb-1 block text-xs font-medium">Final Fit</label><select v-model="finalFit" class="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm"><option value="strong_fit">Strong Fit</option><option value="potential_fit">Potential Fit</option><option value="borderline_requires_validation">Borderline / Requires Validation</option><option value="significant_gap">Significant Gap</option></select></div><div><label class="mb-1 block text-xs font-medium">Recommended Next Step</label><select v-model="recommendedNextStep" class="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm"><option value="proceed_to_hiring_manager_round">Proceed to Hiring Manager Round</option><option value="hold_for_comparison">Hold for Comparison</option><option value="reassess">Reassess</option><option value="recruiter_decision_required">Recruiter Decision Required</option></select></div></div>
        <div><label class="mb-1 block text-xs font-medium">Conversation Brief</label><textarea v-model="conversationBrief" rows="3" class="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm" /></div>
        <div><label class="mb-1 block text-xs font-medium">Hiring Manager Validation Focus</label><textarea v-model="validationFocusText" rows="3" class="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm" placeholder="One item per line" /></div>
        <div class="flex justify-end"><button :disabled="busy || aiInterpreting" class="rounded-lg bg-success-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" @click="completeScreening">Confirm & Complete Screening</button></div>
      </div>
    </div>

    <div v-else-if="screening?.status === 'completed'" class="rounded-lg bg-success-50 p-4 text-sm text-success-800 dark:bg-success-950/30 dark:text-success-300">Recruiter screening completed. Final fit: <strong>{{ screening.finalFit }}</strong>. Recommended next step: <strong>{{ screening.recommendedNextStep }}</strong>.</div>
  </section>
</template>
