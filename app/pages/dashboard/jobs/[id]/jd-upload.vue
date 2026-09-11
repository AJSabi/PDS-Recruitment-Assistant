<script setup lang="ts">
import { ArrowLeft, FileUp, Loader2, Save } from '@lucide/vue'

const route = useRoute()
const jobId = route.params.id as string
const toast = useToast()
const localePath = useLocalePath()
const { job, refresh } = useJob(jobId)
const jdText = ref('')
const uploading = ref(false)
const saving = ref(false)
const uploadedName = ref('')

watch(job, (value: any) => {
  if (value && !jdText.value) jdText.value = value.description ?? ''
}, { immediate: true })

async function handleFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploading.value = true
  try {
    const form = new FormData()
    form.append('file', file)
    const result: any = await $fetch(`/api/jobs/${jobId}/jd/upload`, { method: 'POST', body: form })
    jdText.value = result.text ?? ''
    uploadedName.value = result.filename ?? file.name
    toast.success('JD extracted', { message: 'Review the text below before making it the Active JD.' })
  } catch (err: any) {
    toast.error('Could not upload JD', { message: err?.data?.statusMessage ?? err?.message })
  } finally {
    uploading.value = false
    input.value = ''
  }
}

async function saveActiveJd() {
  const description = jdText.value.trim()
  if (!description) return toast.warning('JD required', 'Upload, paste or enter a Job Description first.')
  saving.value = true
  try {
    await $fetch(`/api/jobs/${jobId}`, { method: 'PATCH', body: { description } })
    await refresh()
    toast.success('Active JD updated', { message: 'Existing assessments are preserved and the requirement is flagged for reassessment where applicable.' })
    await navigateTo(localePath(`/dashboard/jobs/${jobId}`))
  } catch (err: any) {
    toast.error('Could not update Active JD', { message: err?.data?.statusMessage ?? err?.message })
  } finally { saving.value = false }
}
</script>

<template>
  <div class="mx-auto w-full max-w-6xl space-y-5 px-4 pb-8 sm:px-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <button type="button" class="inline-flex items-center gap-2 rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm font-semibold text-surface-700 hover:bg-surface-50" @click="navigateTo(localePath(`/dashboard/jobs/${jobId}`))">
        <ArrowLeft class="size-4" />Back to JD & Skill Matrix
      </button>
      <span class="text-xs text-surface-500">{{ job?.title ?? 'Requirement' }}</span>
    </div>

    <section class="rounded-2xl border border-[#CFE0ED] bg-white p-5 shadow-sm dark:border-surface-800 dark:bg-surface-900">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.16em] text-[#2E86C1]">PDS Recruitment</p>
        <h1 class="mt-1 text-2xl font-bold text-[#102A43] dark:text-white">Upload / Replace Active JD</h1>
        <p class="mt-1 max-w-3xl text-sm text-surface-500">Upload a revised JD, review the extracted text, then save it as the new Active JD. PDF, DOCX, TXT, MD and RTF are supported.</p>
      </div>

      <label class="mt-5 flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#B9D4E7] bg-[#F7FBFE] px-5 py-6 text-sm font-semibold text-[#1F6FA3] hover:border-[#2E86C1]">
        <Loader2 v-if="uploading" class="size-5 animate-spin" /><FileUp v-else class="size-5" />
        {{ uploading ? 'Reading JD…' : 'Choose JD File' }}
        <input type="file" class="hidden" accept=".pdf,.docx,.txt,.md,.rtf" :disabled="uploading || saving" @change="handleFile" />
      </label>
      <p v-if="uploadedName" class="mt-2 text-xs text-surface-500">Loaded: <strong>{{ uploadedName }}</strong></p>

      <textarea v-model="jdText" rows="20" class="mt-4 w-full rounded-xl border border-surface-300 bg-[#FBFDFF] px-4 py-4 text-sm leading-6 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-surface-700 dark:bg-surface-950" placeholder="Upload a JD or paste the revised Job Description here." />

      <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p class="text-xs text-surface-500">Saving a changed JD preserves historical assessments and triggers governed reassessment flags.</p>
        <button type="button" :disabled="saving || uploading || !jdText.trim()" class="inline-flex items-center gap-2 rounded-lg bg-[#2E86C1] px-4 py-2 text-sm font-bold text-white disabled:opacity-40" @click="saveActiveJd">
          <Loader2 v-if="saving" class="size-4 animate-spin" /><Save v-else class="size-4" />{{ saving ? 'Saving…' : 'Save as Active JD' }}
        </button>
      </div>
    </section>
  </div>
</template>
