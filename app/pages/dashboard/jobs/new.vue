<script setup lang="ts">
import { ArrowLeft, Briefcase, FileText, Loader2, UploadCloud } from 'lucide-vue-next'

definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'require-org'],
})

useSeoMeta({
  title: 'New Requirement',
  description: 'Create a recruitment requirement from a JD',
})

const localePath = useLocalePath()
const { createJob } = useJobs()
const toast = useToast()

const form = reactive({
  title: '',
  description: '',
  location: '',
  type: 'full_time' as 'full_time' | 'part_time' | 'contract' | 'internship',
  experienceLevel: 'mid' as 'junior' | 'mid' | 'senior' | 'lead',
})

const jdFileInput = ref<HTMLInputElement | null>(null)
const uploadedJdName = ref('')
const parsingJd = ref(false)
const creating = ref(false)

async function parseJdFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  parsingJd.value = true
  try {
    const body = new FormData()
    body.append('file', file)
    const result: any = await $fetch('/api/jobs/jd/parse', {
      method: 'POST',
      body,
    })

    form.description = result.text ?? ''
    uploadedJdName.value = result.filename ?? file.name
    toast.success('JD extracted', {
      message: 'Review the extracted JD below before creating the requirement.',
    })
  } catch (err: any) {
    toast.error('Could not read JD', {
      message: err?.data?.statusMessage ?? err?.message ?? 'Upload a readable PDF, DOC or DOCX file.',
    })
  } finally {
    parsingJd.value = false
    input.value = ''
  }
}

async function createRequirement() {
  if (!form.title.trim()) {
    toast.warning('Job title required', 'Enter the role title before creating the requirement.')
    return
  }
  if (!form.description.trim()) {
    toast.warning('JD required', 'Upload a JD or paste the JD before continuing.')
    return
  }

  creating.value = true
  try {
    const created: any = await createJob({
      title: form.title.trim(),
      description: form.description.trim(),
      location: form.location.trim() || undefined,
      type: form.type,
      experienceLevel: form.experienceLevel,
      status: 'draft',
      phoneRequirement: 'optional',
      requireResume: true,
      requireCoverLetter: false,
      autoScoreOnApply: false,
      questions: [],
      criteria: [],
    })

    if (!created?.id) throw new Error('Requirement was created without an ID.')

    toast.success('Requirement created', {
      message: 'The JD is now active. AI Skill Matrix analysis will continue on the next screen.',
    })
    await navigateTo(localePath(`/dashboard/jobs/${created.id}/ai-analysis`))
  } catch (err: any) {
    toast.error('Could not create requirement', {
      message: err?.data?.statusMessage ?? err?.message ?? 'Please try again.',
    })
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
    <div class="mb-5 flex items-center gap-3">
      <NuxtLink
        :to="localePath('/dashboard/jobs')"
        class="inline-flex items-center gap-1.5 text-sm font-medium text-surface-500 hover:text-surface-800 dark:text-surface-400 dark:hover:text-surface-100"
      >
        <ArrowLeft class="size-4" />
        Jobs
      </NuxtLink>
    </div>

    <div class="mb-6">
      <div class="flex items-center gap-2">
        <Briefcase class="size-5 text-brand-600" />
        <h1 class="text-xl font-semibold text-surface-900 dark:text-surface-100">New Recruitment Requirement</h1>
      </div>
      <p class="mt-1 text-sm text-surface-500">
        Start with the JD. Upload an existing document or paste the JD, review it, then create the requirement for AI Skill Matrix analysis.
      </p>
    </div>

    <form class="space-y-5 rounded-xl border border-surface-200 bg-white p-5 shadow-sm dark:border-surface-800 dark:bg-surface-900 sm:p-6" @submit.prevent="createRequirement">
      <div>
        <label for="title" class="mb-1.5 block text-sm font-medium text-surface-700 dark:text-surface-300">
          Job Title <span class="text-danger-500">*</span>
        </label>
        <input
          id="title"
          v-model="form.title"
          type="text"
          maxlength="200"
          placeholder="e.g. Account Manager - Enterprise"
          class="w-full rounded-lg border border-surface-300 bg-white px-3 py-2.5 text-sm text-surface-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-100"
        />
      </div>

      <div class="grid gap-4 sm:grid-cols-3">
        <div>
          <label for="location" class="mb-1.5 block text-sm font-medium text-surface-700 dark:text-surface-300">Location</label>
          <input
            id="location"
            v-model="form.location"
            type="text"
            maxlength="500"
            placeholder="e.g. Hyderabad"
            class="w-full rounded-lg border border-surface-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-surface-700 dark:bg-surface-900"
          />
        </div>
        <div>
          <label for="type" class="mb-1.5 block text-sm font-medium text-surface-700 dark:text-surface-300">Employment Type</label>
          <select id="type" v-model="form.type" class="w-full rounded-lg border border-surface-300 bg-white px-3 py-2.5 text-sm dark:border-surface-700 dark:bg-surface-900">
            <option value="full_time">Full-time</option>
            <option value="part_time">Part-time</option>
            <option value="contract">Contract</option>
            <option value="internship">Internship</option>
          </select>
        </div>
        <div>
          <label for="experienceLevel" class="mb-1.5 block text-sm font-medium text-surface-700 dark:text-surface-300">Seniority</label>
          <select id="experienceLevel" v-model="form.experienceLevel" class="w-full rounded-lg border border-surface-300 bg-white px-3 py-2.5 text-sm dark:border-surface-700 dark:bg-surface-900">
            <option value="junior">Junior</option>
            <option value="mid">Mid-level</option>
            <option value="senior">Senior</option>
            <option value="lead">Lead / Leadership</option>
          </select>
        </div>
      </div>

      <div>
        <div class="mb-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <label class="block text-sm font-medium text-surface-700 dark:text-surface-300">Job Description <span class="text-danger-500">*</span></label>
            <p class="mt-0.5 text-xs text-surface-500">Upload PDF, DOC or DOCX, or paste/write the JD directly below.</p>
          </div>
          <div>
            <input ref="jdFileInput" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" class="hidden" @change="parseJdFile" />
            <button
              type="button"
              :disabled="parsingJd"
              class="inline-flex items-center gap-2 rounded-lg border border-brand-300 px-3.5 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50 dark:border-brand-700 dark:text-brand-300 dark:hover:bg-brand-950/30"
              @click="jdFileInput?.click()"
            >
              <Loader2 v-if="parsingJd" class="size-4 animate-spin" />
              <UploadCloud v-else class="size-4" />
              {{ parsingJd ? 'Reading JD…' : 'Upload JD' }}
            </button>
          </div>
        </div>

        <div v-if="uploadedJdName" class="mb-2 flex items-center gap-2 rounded-lg bg-success-50 px-3 py-2 text-xs text-success-700 dark:bg-success-950/30 dark:text-success-300">
          <FileText class="size-4" />
          Extracted from {{ uploadedJdName }}. The text below is editable.
        </div>

        <textarea
          v-model="form.description"
          rows="16"
          maxlength="100000"
          placeholder="Paste or write the complete JD here..."
          class="w-full rounded-lg border border-surface-300 bg-white px-4 py-3 text-sm leading-6 text-surface-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-100"
        />
      </div>

      <div class="flex flex-wrap items-center justify-between gap-3 border-t border-surface-200 pt-5 dark:border-surface-800">
        <p class="text-xs text-surface-500">Next: AI analyses the Active JD and prepares the Skill Matrix for recruiter approval.</p>
        <button
          type="submit"
          :disabled="creating || parsingJd"
          class="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          <Loader2 v-if="creating" class="size-4 animate-spin" />
          <Briefcase v-else class="size-4" />
          {{ creating ? 'Creating…' : 'Create Requirement & Analyse JD' }}
        </button>
      </div>
    </form>
  </div>
</template>
