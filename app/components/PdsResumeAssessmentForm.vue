<script setup lang="ts">
const props = defineProps<{ applicationId: string; enabled: boolean }>()
const emit = defineEmits<{ saved: [] }>()
const toast = useToast()
const saving = ref(false)

const { data, refresh } = useFetch(() => `/api/applications/${props.applicationId}/resume-assessment`, {
  key: computed(() => `pds-resume-assessment-${props.applicationId}`),
  headers: useRequestHeaders(['cookie']),
})

const form = reactive({
  candidateSnapshot: '',
  jdAlignment: '',
  mandatoryScore: null as number | null,
  preferredScore: null as number | null,
  experienceScore: null as number | null,
  optionalScore: null as number | null,
  mandatoryMatch: '',
  keyStrength: '',
  mainGap: '',
  keyGapsText: '',
  verificationAreasText: '',
})

watch(data, (value: any) => {
  const a = value?.assessment
  if (!a) return
  form.candidateSnapshot = a.candidateSnapshot ?? ''
  form.jdAlignment = a.jdAlignment ?? ''
  form.mandatoryScore = a.mandatoryScore ?? null
  form.preferredScore = a.preferredScore ?? null
  form.experienceScore = a.experienceScore ?? null
  form.optionalScore = a.optionalScore ?? null
  form.mandatoryMatch = a.mandatoryMatch ?? ''
  form.keyStrength = a.keyStrength ?? ''
  form.mainGap = a.mainGap ?? ''
  form.keyGapsText = (a.keyGaps ?? []).join('\n')
  form.verificationAreasText = (a.verificationAreas ?? []).join('\n')
}, { immediate: true })

function lines(value: string) {
  return value.split('\n').map(v => v.trim()).filter(Boolean)
}

async function saveAssessment() {
  if (!props.enabled) return
  saving.value = true
  try {
    await $fetch(`/api/applications/${props.applicationId}/resume-assessment`, {
      method: 'PUT',
      body: {
        candidateSnapshot: form.candidateSnapshot || null,
        jdAlignment: form.jdAlignment || null,
        skillAssessment: [],
        keyGaps: lines(form.keyGapsText),
        verificationAreas: lines(form.verificationAreasText),
        mandatoryScore: form.mandatoryScore,
        preferredScore: form.preferredScore,
        experienceScore: form.experienceScore,
        optionalScore: form.optionalScore,
        mandatoryMatch: form.mandatoryMatch || null,
        keyStrength: form.keyStrength || null,
        mainGap: form.mainGap || null,
        source: 'manual',
      },
    })
    await refresh()
    toast.success('Resume assessment saved')
    emit('saved')
  } catch (err: any) {
    toast.error('Could not save assessment', { message: err?.data?.statusMessage ?? err?.message })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="rounded-xl border border-surface-200 bg-white p-5 dark:border-surface-800 dark:bg-surface-900">
    <div class="mb-4">
      <h2 class="text-sm font-semibold text-surface-800 dark:text-surface-200">Resume Assessment</h2>
      <p class="mt-1 text-xs text-surface-500">Manual framework for now. Copilot can populate the same fields later.</p>
    </div>

    <div v-if="!enabled" class="rounded-lg border border-dashed border-surface-300 p-4 text-sm text-surface-500 dark:border-surface-700">
      Select a resume for this application before assessment.
    </div>

    <div v-else class="space-y-4">
      <div>
        <label class="mb-1 block text-xs font-medium text-surface-600">Candidate Snapshot</label>
        <textarea v-model="form.candidateSnapshot" rows="3" class="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800" placeholder="Brief profile summary" />
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium text-surface-600">JD Alignment</label>
        <textarea v-model="form.jdAlignment" rows="3" class="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800" placeholder="How the resume aligns with the requirement" />
      </div>

      <div class="grid gap-3 sm:grid-cols-4">
        <div v-for="field in [{k:'mandatoryScore',l:'Mandatory 60%'},{k:'preferredScore',l:'Preferred 20%'},{k:'experienceScore',l:'Experience 15%'},{k:'optionalScore',l:'Optional 5%'}]" :key="field.k">
          <label class="mb-1 block text-xs font-medium text-surface-600">{{ field.l }}</label>
          <input v-model.number="(form as any)[field.k]" type="number" min="0" max="100" class="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800" />
        </div>
      </div>

      <div class="grid gap-3 sm:grid-cols-3">
        <div><label class="mb-1 block text-xs font-medium text-surface-600">Mandatory Match</label><input v-model="form.mandatoryMatch" class="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800" /></div>
        <div><label class="mb-1 block text-xs font-medium text-surface-600">Key Strength</label><input v-model="form.keyStrength" class="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800" /></div>
        <div><label class="mb-1 block text-xs font-medium text-surface-600">Main Gap</label><input v-model="form.mainGap" class="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800" /></div>
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <div><label class="mb-1 block text-xs font-medium text-surface-600">Key Gaps</label><textarea v-model="form.keyGapsText" rows="4" class="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800" placeholder="One gap per line" /></div>
        <div><label class="mb-1 block text-xs font-medium text-surface-600">Verification Areas</label><textarea v-model="form.verificationAreasText" rows="4" class="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800" placeholder="One area per line" /></div>
      </div>

      <div class="flex justify-end">
        <button :disabled="saving" class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" @click="saveAssessment">{{ saving ? 'Saving…' : 'Save Resume Assessment' }}</button>
      </div>
    </div>
  </section>
</template>
