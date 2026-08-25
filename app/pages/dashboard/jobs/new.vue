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
  functionName: '',
  hiringManager: '',
  location: '',
  type: 'full_time' as 'full_time' | 'part_time' | 'contract' | 'internship',
  experienceRequirement: '',
  experienceLevel: 'mid' as 'junior' | 'mid' | 'senior' | 'lead',
  openings: 1,
  closureDate: '',
  majorRequirements: '',
})

const jdFileInput = ref<HTMLInputElement | null>(null)
const uploadedJdName = ref('')
const parsingJd = ref(false)
const creating = ref(false)

function lines(value: string) {
  return value.split('\n').map(item => item.trim()).filter(Boolean).slice(0, 20)
}

function dateToIso(value: string) {
  if (!value) return undefined
  return new Date(`${value}T12:00:00`).toISOString()
}

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isNetworkFailure(err: any) {
  const status = err?.statusCode ?? err?.status ?? err?.response?.status
  if (status) return false
  const message = String(err?.message ?? '').toLowerCase()
  return message.includes('failed to fetch') || message.includes('<no response>') || message.includes('network')
}

async function parseJdWithRetry(file: File) {
  const maxAttempts = 3
  let lastError: any

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const body = new FormData()
      body.append('file', file)
      return await $fetch('/api/jobs/jd/parse', { method: 'POST', body })
    } catch (err: any) {
      lastError = err
      if (!isNetworkFailure(err) || attempt === maxAttempts) throw err
      await wait(attempt * 700)
    }
  }

  throw lastError
}

async function parseJdFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  parsingJd.value = true
  try {
    const result: any = await parseJdWithRetry(file)
    form.description = result.text ?? ''
    uploadedJdName.value = result.filename ?? file.name
    toast.success('JD extracted', { message: 'Review the extracted JD below before creating the requirement.' })
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
  if (!form.title.trim()) return toast.warning('Job title required', 'Enter the role title before creating the requirement.')
  if (!form.description.trim()) return toast.warning('JD required', 'Upload a JD or paste the JD before continuing.')
  if (!Number.isInteger(form.openings) || form.openings < 1) return toast.warning('Openings required', 'Openings must be at least 1.')

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

    await $fetch(`/api/jobs/${created.id}/requirement-profile`, {
      method: 'PUT',
      body: {
        functionName: form.functionName.trim() || null,
        hiringManager: form.hiringManager.trim() || null,
        experienceRequirement: form.experienceRequirement.trim() || null,
        openings: form.openings,
        majorRequirements: lines(form.majorRequirements),
        assignmentDate: new Date().toISOString(),
        targetClosureDate: dateToIso(form.closureDate),
      },
    })

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
    <div class="mb-5">
      <NuxtLink :to="localePath('/dashboard/jobs')" class="inline-flex items-center gap-1.5 text-sm font-medium text-surface-500 hover:text-surface-800 dark:text-surface-400 dark:hover:text-surface-100">
        <ArrowLeft class="size-4" /> Jobs
      </NuxtLink>
    </div>

    <div class="mb-6">
      <div class="flex items-center gap-2">
        <Briefcase class="size-5 text-brand-600" />
        <h1 class="text-xl font-semibold text-surface-900 dark:text-surface-100">New Recruitment Requirement</h1>
      </div>
      <p class="mt-1 text-sm text-surface-500">Create the Requirement Profile, then upload or paste the JD for AI Skill Matrix analysis.</p>
    </div>

    <form class="space-y-6 rounded-xl border border-surface-200 bg-white p-5 shadow-sm dark:border-surface-800 dark:bg-surface-900 sm:p-6" @submit.prevent="createRequirement">
      <section class="space-y-4">
        <div><h2 class="text-sm font-semibold text-surface-800 dark:text-surface-200">Requirement Profile</h2><p class="mt-1 text-xs text-surface-500">Only Job Title and JD are mandatory. Unavailable fields remain Not Specified.</p></div>

        <div class="grid gap-4 sm:grid-cols-2">
          <label class="block"><span class="mb-1.5 block text-sm font-medium">Job Title <span class="text-danger-500">*</span></span><input v-model="form.title" maxlength="200" placeholder="e.g. Account Manager - Enterprise" class="w-full rounded-lg border border-surface-300 bg-white px-3 py-2.5 text-sm dark:border-surface-700 dark:bg-surface-900" /></label>
          <label class="block"><span class="mb-1.5 block text-sm font-medium">Function</span><input v-model="form.functionName" maxlength="300" placeholder="e.g. Sales" class="w-full rounded-lg border border-surface-300 bg-white px-3 py-2.5 text-sm dark:border-surface-700 dark:bg-surface-900" /></label>
          <label class="block"><span class="mb-1.5 block text-sm font-medium">Hiring Manager</span><input v-model="form.hiringManager" maxlength="300" placeholder="Name / designation" class="w-full rounded-lg border border-surface-300 bg-white px-3 py-2.5 text-sm dark:border-surface-700 dark:bg-surface-900" /></label>
          <label class="block"><span class="mb-1.5 block text-sm font-medium">Location</span><input v-model="form.location" maxlength="500" placeholder="e.g. Hyderabad" class="w-full rounded-lg border border-surface-300 bg-white px-3 py-2.5 text-sm dark:border-surface-700 dark:bg-surface-900" /></label>
          <label class="block"><span class="mb-1.5 block text-sm font-medium">Experience Requirement</span><input v-model="form.experienceRequirement" maxlength="500" placeholder="e.g. 10-15 years" class="w-full rounded-lg border border-surface-300 bg-white px-3 py-2.5 text-sm dark:border-surface-700 dark:bg-surface-900" /></label>
          <label class="block"><span class="mb-1.5 block text-sm font-medium">Seniority</span><select v-model="form.experienceLevel" class="w-full rounded-lg border border-surface-300 bg-white px-3 py-2.5 text-sm dark:border-surface-700 dark:bg-surface-900"><option value="junior">Junior</option><option value="mid">Mid-level</option><option value="senior">Senior</option><option value="lead">Lead / Leadership</option></select></label>
          <label class="block"><span class="mb-1.5 block text-sm font-medium">Openings</span><input v-model.number="form.openings" type="number" min="1" max="500" class="w-full rounded-lg border border-surface-300 bg-white px-3 py-2.5 text-sm dark:border-surface-700 dark:bg-surface-900" /></label>
          <label class="block"><span class="mb-1.5 block text-sm font-medium">Closure Date</span><input v-model="form.closureDate" type="date" class="w-full rounded-lg border border-surface-300 bg-white px-3 py-2.5 text-sm dark:border-surface-700 dark:bg-surface-900" /><span class="mt-1 block text-xs text-surface-500">If blank, target closure defaults to 60 days from assignment.</span></label>
          <label class="block"><span class="mb-1.5 block text-sm font-medium">Employment Type</span><select v-model="form.type" class="w-full rounded-lg border border-surface-300 bg-white px-3 py-2.5 text-sm dark:border-surface-700 dark:bg-surface-900"><option value="full_time">Full-time</option><option value="part_time">Part-time</option><option value="contract">Contract</option><option value="internship">Internship</option></select></label>
          <label class="block"><span class="mb-1.5 block text-sm font-medium">Major Requirements</span><textarea v-model="form.majorRequirements" rows="3" maxlength="5000" placeholder="Optional: one major requirement per line" class="w-full rounded-lg border border-surface-300 bg-white px-3 py-2.5 text-sm dark:border-surface-700 dark:bg-surface-900" /></label>
        </div>
      </section>

      <section class="border-t border-surface-200 pt-5 dark:border-surface-800">
        <div class="mb-2 flex flex-wrap items-center justify-between gap-3">
          <div><label class="block text-sm font-medium">Job Description <span class="text-danger-500">*</span></label><p class="mt-0.5 text-xs text-surface-500">Upload PDF, DOC or DOCX, or paste/write the JD directly.</p></div>
          <div>
            <input ref="jdFileInput" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" class="hidden" @change="parseJdFile" />
            <button type="button" :disabled="parsingJd" class="inline-flex items-center gap-2 rounded-lg border border-brand-300 px-3.5 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50 dark:border-brand-700 dark:text-brand-300" @click="jdFileInput?.click()">
              <Loader2 v-if="parsingJd" class="size-4 animate-spin" /><UploadCloud v-else class="size-4" />{{ parsingJd ? 'Reading JD…' : 'Upload JD' }}
            </button>
          </div>
        </div>
        <div v-if="uploadedJdName" class="mb-2 flex items-center gap-2 rounded-lg bg-success-50 px-3 py-2 text-xs text-success-700 dark:bg-success-950/30 dark:text-success-300"><FileText class="size-4" />Extracted from {{ uploadedJdName }}. The text below is editable.</div>
        <textarea v-model="form.description" rows="16" maxlength="100000" placeholder="Paste or write the complete JD here..." class="w-full rounded-lg border border-surface-300 bg-white px-4 py-3 text-sm leading-6 dark:border-surface-700 dark:bg-surface-900" />
      </section>

      <div class="flex flex-wrap items-center justify-between gap-3 border-t border-surface-200 pt-5 dark:border-surface-800">
        <p class="text-xs text-surface-500">Next: AI prepares the Skill Matrix for recruiter review and approval.</p>
        <button type="submit" :disabled="creating || parsingJd" class="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"><Loader2 v-if="creating" class="size-4 animate-spin" /><Briefcase v-else class="size-4" />{{ creating ? 'Creating…' : 'Create Requirement & Analyse JD' }}</button>
      </div>
    </form>
  </div>
</template>
