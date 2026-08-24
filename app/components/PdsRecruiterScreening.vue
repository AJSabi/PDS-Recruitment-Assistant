<script setup lang="ts">
const props = defineProps<{ applicationId: string; enabled: boolean }>()
const emit = defineEmits<{ changed: [] }>()
const toast = useToast()

const { data, refresh } = useFetch(() => `/api/applications/${props.applicationId}/screening`, {
  key: computed(() => `pds-screening-${props.applicationId}`),
  headers: useRequestHeaders(['cookie']),
})

const questionText = ref('')
const answer = ref('')
const busy = ref(false)
const finalFit = ref('potential_fit')
const recommendedNextStep = ref('proceed_to_hod_round')
const conversationBrief = ref('')
const validationFocusText = ref('')

const screening = computed<any>(() => data.value?.screening ?? null)
const currentQuestion = computed<any>(() => data.value?.currentQuestion ?? null)
const progress = computed<any>(() => data.value?.progress ?? { answered: 0, total: 0 })
const readyToComplete = computed(() => Boolean(data.value?.readyToComplete))

function lines(value: string) {
  return value.split('\n').map(v => v.trim()).filter(Boolean)
}

async function startScreening() {
  const qs = lines(questionText.value).slice(0, 10)
  if (!qs.length) return toast.warning('Add screening questions', 'Enter one question per line.')
  busy.value = true
  try {
    await $fetch(`/api/applications/${props.applicationId}/screening/start`, {
      method: 'POST',
      body: { questions: qs.map((q, i) => ({ id: `q${i + 1}`, question: q })) },
    })
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
    await $fetch(`/api/applications/${props.applicationId}/screening/answer`, {
      method: 'POST',
      body: { questionId: currentQuestion.value.id, answer: answer.value.trim() },
    })
    answer.value = ''
    await refresh()
    emit('changed')
  } catch (err: any) {
    toast.error('Could not save answer', { message: err?.data?.statusMessage ?? err?.message })
  } finally { busy.value = false }
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
    <div class="mb-4">
      <h2 class="text-sm font-semibold text-surface-800 dark:text-surface-200">Recruiter Screening</h2>
      <p class="mt-1 text-xs text-surface-500">Maximum 10 practical questions. Answers are captured one at a time.</p>
    </div>

    <div v-if="!enabled && screening?.status === 'not_started'" class="rounded-lg border border-dashed border-surface-300 p-4 text-sm text-surface-500 dark:border-surface-700">
      Complete the resume assessment before starting recruiter screening.
    </div>

    <div v-else-if="screening?.status === 'not_started'" class="space-y-3">
      <label class="block text-xs font-medium text-surface-600">Screening Questions</label>
      <textarea v-model="questionText" rows="8" class="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800" placeholder="Enter one question per line. Up to 10 questions." />
      <div class="flex justify-end"><button :disabled="busy" class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" @click="startScreening">Start Screening</button></div>
    </div>

    <div v-else-if="screening?.status === 'in_progress'" class="space-y-4">
      <div class="text-xs text-surface-500">Question {{ progress.answered + 1 }} of {{ progress.total }}</div>
      <template v-if="currentQuestion">
        <div class="rounded-lg bg-surface-50 p-4 text-sm font-medium text-surface-800 dark:bg-surface-800/60 dark:text-surface-100">{{ currentQuestion.question }}</div>
        <div v-if="currentQuestion.options?.length" class="flex flex-wrap gap-2">
          <button v-for="option in currentQuestion.options" :key="option" class="rounded-lg border border-surface-300 px-3 py-1.5 text-xs" @click="answer = option">{{ option }}</button>
        </div>
        <textarea v-model="answer" rows="3" class="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800" placeholder="Recruiter response" />
        <div class="flex justify-end"><button :disabled="busy || !answer.trim()" class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" @click="submitAnswer">Save & Next</button></div>
      </template>

      <div v-if="readyToComplete" class="space-y-3 rounded-lg border border-surface-200 p-4 dark:border-surface-700">
        <h3 class="text-sm font-semibold">Complete Screening</h3>
        <div class="grid gap-3 sm:grid-cols-2">
          <div><label class="mb-1 block text-xs font-medium">Final Fit</label><select v-model="finalFit" class="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800"><option value="strong_fit">Strong Fit</option><option value="potential_fit">Potential Fit</option><option value="borderline_requires_validation">Borderline / Requires Validation</option><option value="significant_gap">Significant Gap</option></select></div>
          <div><label class="mb-1 block text-xs font-medium">Recommended Next Step</label><select v-model="recommendedNextStep" class="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800"><option value="proceed_to_hod_round">Proceed to HOD Round</option><option value="hold_for_comparison">Hold for Comparison</option><option value="reassess">Reassess</option><option value="recruiter_decision_required">Recruiter Decision Required</option></select></div>
        </div>
        <div><label class="mb-1 block text-xs font-medium">Conversation Brief</label><textarea v-model="conversationBrief" rows="3" class="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800" /></div>
        <div><label class="mb-1 block text-xs font-medium">HOD Validation Focus</label><textarea v-model="validationFocusText" rows="3" class="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800" placeholder="One item per line" /></div>
        <div class="flex justify-end"><button :disabled="busy" class="rounded-lg bg-success-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" @click="completeScreening">Complete Screening</button></div>
      </div>
    </div>

    <div v-else-if="screening?.status === 'completed'" class="rounded-lg bg-success-50 p-4 text-sm text-success-800 dark:bg-success-950/30 dark:text-success-300">
      Screening completed. Final fit: <strong>{{ screening.finalFit }}</strong>. Recommended next step: <strong>{{ screening.recommendedNextStep }}</strong>.
    </div>
  </section>
</template>
