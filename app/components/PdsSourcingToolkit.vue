<script setup lang="ts">
import { Clipboard, Loader2, Save, Search, Sparkles } from 'lucide-vue-next'

const props = defineProps<{ jobId: string }>()
const toast = useToast()
const generating = ref(false)
const saving = ref(false)
const majorSkillsText = ref('')
const booleanSearch = ref('')
const recruiterFeedback = ref('')

const { data, status, refresh } = useFetch(() => `/api/jobs/${props.jobId}/sourcing`, {
  key: computed(() => `pds-sourcing-${props.jobId}`),
  headers: useRequestHeaders(['cookie']),
})

watch(data, (value: any) => {
  if (!value) return
  majorSkillsText.value = (value.majorSkills ?? []).join('\n')
  booleanSearch.value = value.booleanSearch ?? ''
  recruiterFeedback.value = value.recruiterFeedback ?? ''
}, { immediate: true })

const majorSkills = computed(() => majorSkillsText.value.split('\n').map(v => v.trim()).filter(Boolean).slice(0, 12))

async function generateToolkit() {
  generating.value = true
  try {
    const result: any = await $fetch(`/api/jobs/${props.jobId}/sourcing/generate`, {
      method: 'POST',
      body: { recruiterFeedback: recruiterFeedback.value.trim() },
    })
    majorSkillsText.value = (result.majorSkills ?? []).join('\n')
    booleanSearch.value = result.booleanSearch ?? ''
    await refresh()
    toast.success('Sourcing toolkit refreshed', { message: 'Major skills and the Boolean search string were regenerated from the Active JD and current recruiter feedback.' })
  } catch (err: any) {
    toast.error('Could not generate sourcing toolkit', { message: err?.data?.statusMessage ?? err?.message })
  } finally { generating.value = false }
}

async function saveToolkit() {
  saving.value = true
  try {
    await $fetch(`/api/jobs/${props.jobId}/sourcing`, {
      method: 'PUT',
      body: {
        majorSkills: majorSkills.value,
        booleanSearch: booleanSearch.value.trim(),
        recruiterFeedback: recruiterFeedback.value.trim(),
      },
    })
    await refresh()
    toast.success('Recruiter sourcing changes saved')
  } catch (err: any) {
    toast.error('Could not save sourcing toolkit', { message: err?.data?.statusMessage ?? err?.message })
  } finally { saving.value = false }
}

async function copyBoolean() {
  if (!booleanSearch.value.trim()) return
  await navigator.clipboard.writeText(booleanSearch.value.trim())
  toast.success('Boolean search copied')
}
</script>

<template>
  <div class="space-y-5">
    <section class="rounded-2xl border border-[#CFE0ED] bg-white p-5 shadow-sm dark:border-surface-800 dark:bg-surface-900">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div class="flex items-center gap-2"><Search class="size-5 text-[#2E86C1]" /><h2 class="text-lg font-bold text-[#102A43] dark:text-white">Recruiter Sourcing Toolkit</h2></div>
          <p class="mt-1 max-w-3xl text-sm text-surface-500">Major skills and a portal-ready Boolean search are generated from the Active JD and current Skill Matrix. Recruiter edits are always allowed and AI refresh runs only when explicitly requested.</p>
        </div>
        <button type="button" :disabled="generating || saving" class="inline-flex items-center gap-2 rounded-lg bg-[#2E86C1] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" @click="generateToolkit">
          <Loader2 v-if="generating" class="size-4 animate-spin" /><Sparkles v-else class="size-4" />{{ generating ? 'Refreshing…' : (booleanSearch ? 'Refresh with AI' : 'Generate with AI') }}
        </button>
      </div>
    </section>

    <div v-if="status === 'pending'" class="rounded-xl border border-surface-200 bg-white p-8 text-center text-sm text-surface-400">Loading sourcing toolkit…</div>

    <template v-else>
      <section class="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm dark:border-surface-800 dark:bg-surface-900">
        <h3 class="font-bold text-[#102A43] dark:text-white">Major Skill Sets Required as per JD</h3>
        <p class="mt-1 text-xs text-surface-500">Keep 5–12 recruiter-searchable skills. One skill per line. You may edit these manually before saving.</p>
        <textarea v-model="majorSkillsText" rows="8" class="mt-3 w-full rounded-xl border border-surface-300 bg-[#FBFDFF] px-4 py-3 text-sm leading-6 dark:border-surface-700 dark:bg-surface-950" placeholder="One major skill per line" />
        <div v-if="majorSkills.length" class="mt-3 flex flex-wrap gap-2"><span v-for="skill in majorSkills" :key="skill" class="rounded-full bg-[#EAF4FB] px-3 py-1 text-xs font-semibold text-[#1F6FA3]">{{ skill }}</span></div>
      </section>

      <section class="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm dark:border-surface-800 dark:bg-surface-900">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div><h3 class="font-bold text-[#102A43] dark:text-white">Boolean Search String for Job Portal</h3><p class="mt-1 text-xs text-surface-500">Paste directly into a supported job portal/resume database. Recruiters can manually change the string at any time.</p></div>
          <button type="button" :disabled="!booleanSearch.trim()" class="inline-flex items-center gap-2 rounded-lg border border-surface-300 px-3 py-2 text-xs font-semibold text-surface-700 disabled:opacity-40" @click="copyBoolean"><Clipboard class="size-3.5" />Copy</button>
        </div>
        <textarea v-model="booleanSearch" rows="7" class="mt-3 w-full rounded-xl border border-surface-300 bg-[#FBFDFF] px-4 py-3 font-mono text-sm leading-6 dark:border-surface-700 dark:bg-surface-950" placeholder='Example: ("account manager" OR "business development manager") AND (enterprise OR B2B) AND ...' />
      </section>

      <section class="rounded-2xl border border-[#D7E9E7] bg-[#F4FBFA] p-5 dark:border-surface-700 dark:bg-surface-800/40">
        <h3 class="font-bold text-[#102A43] dark:text-white">Recruiter Feedback for AI Refresh</h3>
        <p class="mt-1 text-xs text-surface-500">Tell AI what is too broad, too narrow, missing or producing irrelevant profiles. The next Refresh with AI will use this feedback and the current Boolean string as context.</p>
        <textarea v-model="recruiterFeedback" rows="4" class="mt-3 w-full rounded-xl border border-surface-300 bg-white px-4 py-3 text-sm dark:border-surface-700 dark:bg-surface-900" placeholder="Example: Too many software-sales profiles. Prioritise system-integrator experience and enterprise infrastructure solution selling." />
        <div class="mt-4 flex justify-end"><button type="button" :disabled="saving || generating" class="inline-flex items-center gap-2 rounded-lg bg-[#16847F] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" @click="saveToolkit"><Loader2 v-if="saving" class="size-4 animate-spin" /><Save v-else class="size-4" />{{ saving ? 'Saving…' : 'Save Recruiter Changes' }}</button></div>
      </section>
    </template>
  </div>
</template>
