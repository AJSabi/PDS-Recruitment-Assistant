<script setup lang="ts">
import { ArrowLeft, BriefcaseBusiness, CheckCircle2, FileText, Loader2, Sparkles, UploadCloud } from '@lucide/vue'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'require-org'] })
useSeoMeta({ title: 'New Requirement', description: 'Create a PDS recruitment requirement from a JD' })

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

const uploadedJdName = ref('')
const profileExtracted = ref(false)
const parsingJd = ref(false)
const creating = ref(false)

const hasJd = computed(() => Boolean(form.description.trim()))
const hasCoreProfile = computed(() => Boolean(form.title.trim()) && Number.isInteger(form.openings) && form.openings > 0)
const setupReady = computed(() => hasJd.value && hasCoreProfile.value)
const majorRequirementCount = computed(() => lines(form.majorRequirements).length)

function lines(value: string) {
  return value.split('\n').map(item => item.trim()).filter(Boolean).slice(0, 20)
}

function dateToIso(value: string) {
  if (!value) return undefined
  return new Date(`${value}T12:00:00`).toISOString()
}

function wait(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)) }
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
    }
    catch (err: any) {
      lastError = err
      if (!isNetworkFailure(err) || attempt === maxAttempts) throw err
      await wait(attempt * 700)
    }
  }
  throw lastError
}

function applyRequirementProfile(profile: any) {
  if (!profile) {
    profileExtracted.value = false
    return
  }
  if (profile.jobTitle) form.title = profile.jobTitle
  if (profile.functionName) form.functionName = profile.functionName
  if (profile.hiringManager) form.hiringManager = profile.hiringManager
  if (profile.location) form.location = profile.location
  if (profile.experienceRequirement) form.experienceRequirement = profile.experienceRequirement
  if (profile.seniority && ['junior', 'mid', 'senior', 'lead'].includes(profile.seniority)) form.experienceLevel = profile.seniority
  if (Number.isInteger(profile.openings) && profile.openings > 0) form.openings = profile.openings
  if (Array.isArray(profile.majorRequirements) && profile.majorRequirements.length) form.majorRequirements = profile.majorRequirements.join('\n')
  const closure = String(profile.closureDate ?? '')
  if (/^\d{4}-\d{2}-\d{2}/.test(closure)) form.closureDate = closure.slice(0, 10)
  profileExtracted.value = true
}

async function parseJdFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  parsingJd.value = true
  profileExtracted.value = false
  try {
    const result: any = await parseJdWithRetry(file)
    form.description = result.text ?? ''
    uploadedJdName.value = result.filename ?? file.name
    applyRequirementProfile(result.requirementProfile)
    toast.success('JD extracted', {
      message: result.requirementProfile
        ? 'AI extracted the JD and Requirement Profile. Review the highlighted details before creating the requirement.'
        : 'JD text was extracted. Complete the Requirement Profile before continuing.',
    })
  }
  catch (err: any) {
    toast.error('Could not read JD', { message: err?.data?.statusMessage ?? err?.message ?? 'Upload a readable PDF, DOC or DOCX file.' })
  }
  finally {
    parsingJd.value = false
    input.value = ''
  }
}

async function createRequirement() {
  if (!form.title.trim()) return toast.warning('Job title required', 'Enter the role title before creating the requirement.')
  if (!form.description.trim()) return toast.warning('JD required', 'Upload, paste or write the JD before continuing.')
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
        targetClosureDate: dateToIso(form.closureDate),
      },
    })

    toast.success('Requirement created', { message: 'Review the AI Skill Matrix next. Recruiter allocation remains separate in Allocation Management.' })
    await navigateTo(localePath(`/dashboard/jobs/${created.id}/ai-analysis`))
  }
  catch (err: any) {
    toast.error('Could not create requirement', { message: err?.data?.statusMessage ?? err?.message ?? 'Please try again.' })
  }
  finally { creating.value = false }
}
</script>

<template>
  <div class="mx-auto w-full max-w-6xl space-y-6">
    <NuxtLink :to="localePath('/dashboard/jobs')" class="inline-flex items-center gap-1.5 text-sm font-semibold text-surface-500 no-underline hover:text-brand-700 dark:text-surface-400">
      <ArrowLeft class="size-4" />All Requirements
    </NuxtLink>

    <section class="overflow-hidden rounded-3xl bg-[#102A43] text-white shadow-sm">
      <div class="px-6 py-7 sm:px-8">
        <p class="text-xs font-bold uppercase tracking-[0.18em] text-[#9FD3F2]">Requirement Setup</p>
        <div class="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 class="text-3xl font-bold tracking-tight">Create New Requirement</h1>
            <p class="mt-2 max-w-3xl text-sm leading-6 text-[#D5E6F3]">Start with the JD. PDS Recruitment Assistant can extract the Requirement Profile, after which you review the details and move directly to the AI Skill Matrix.</p>
          </div>
          <div class="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
            <p class="text-[10px] font-bold uppercase tracking-wide text-[#9FD3F2]">Requirement Status</p>
            <p class="mt-1 font-semibold">Unallocated until assigned</p>
          </div>
        </div>

        <div class="mt-6 grid gap-2 sm:grid-cols-4">
          <div class="rounded-xl border border-white/10 bg-white/10 p-3"><p class="text-[10px] font-bold uppercase tracking-wide text-[#9FD3F2]">1. Job Description</p><p class="mt-1 text-sm font-semibold">{{ hasJd ? 'Ready' : 'Required' }}</p></div>
          <div class="rounded-xl border border-white/10 bg-white/10 p-3"><p class="text-[10px] font-bold uppercase tracking-wide text-[#9FD3F2]">2. Requirement Profile</p><p class="mt-1 text-sm font-semibold">{{ hasCoreProfile ? 'Ready to review' : 'Complete details' }}</p></div>
          <div class="rounded-xl border border-white/10 bg-white/5 p-3"><p class="text-[10px] font-bold uppercase tracking-wide text-[#9FD3F2]">3. Skill Matrix</p><p class="mt-1 text-sm font-semibold text-[#D5E6F3]">Next screen</p></div>
          <div class="rounded-xl border border-white/10 bg-white/5 p-3"><p class="text-[10px] font-bold uppercase tracking-wide text-[#9FD3F2]">4. Allocation</p><p class="mt-1 text-sm font-semibold text-[#D5E6F3]">Managed separately</p></div>
        </div>
      </div>
    </section>

    <form class="space-y-6" @submit.prevent="createRequirement">
      <section class="rounded-2xl border border-[#CFE0ED] bg-white p-5 shadow-sm dark:border-surface-800 dark:bg-surface-900 sm:p-6">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="flex gap-3">
            <div class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#EAF4FB] text-[#1F6FA3]"><FileText class="size-5" /></div>
            <div><p class="text-xs font-bold uppercase tracking-wide text-[#2E86C1]">Step 1</p><h2 class="mt-1 text-lg font-bold text-[#102A43] dark:text-white">Job Description</h2><p class="mt-1 text-sm text-surface-500">Upload a JD for automatic extraction, or paste/write the complete JD below.</p></div>
          </div>
          <div>
            <input id="pds-jd-upload" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" class="sr-only" :disabled="parsingJd" @change="parseJdFile" />
            <label for="pds-jd-upload" :class="['inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[#9EC8E2] bg-[#F5FAFD] px-4 py-2.5 text-sm font-bold text-[#1F6FA3] hover:bg-[#EAF4FB] dark:border-brand-800 dark:bg-brand-950/20 dark:text-brand-300', parsingJd ? 'pointer-events-none opacity-50' : '']">
              <Loader2 v-if="parsingJd" class="size-4 animate-spin" /><UploadCloud v-else class="size-4" />{{ parsingJd ? 'Reading JD…' : 'Upload JD' }}
            </label>
          </div>
        </div>

        <div v-if="uploadedJdName" class="mt-4 flex items-start gap-2 rounded-xl border border-[#B8E2DE] bg-[#F1FAF9] px-4 py-3 text-sm text-[#13756F] dark:border-surface-700 dark:bg-surface-800">
          <CheckCircle2 class="mt-0.5 size-4 shrink-0" /><div><p class="font-semibold">{{ uploadedJdName }} extracted</p><p class="mt-0.5 text-xs">{{ profileExtracted ? 'AI populated the Requirement Profile below. Review every field before continuing.' : 'JD text is ready. Complete the Requirement Profile below.' }}</p></div>
        </div>

        <textarea v-model="form.description" rows="14" maxlength="100000" placeholder="Upload, paste or write the complete Job Description here..." class="mt-5 w-full rounded-xl border border-surface-300 bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-[#2E86C1] focus:ring-2 focus:ring-[#2E86C1]/10 dark:border-surface-700 dark:bg-surface-950" />
        <div class="mt-2 flex justify-between text-xs text-surface-400"><span>Only the active JD will be used for AI Skill Matrix generation.</span><span>{{ form.description.length.toLocaleString() }} characters</span></div>
      </section>

      <section class="rounded-2xl border border-[#D7E9E7] bg-white p-5 shadow-sm dark:border-surface-800 dark:bg-surface-900 sm:p-6">
        <div class="mb-5 flex items-start gap-3">
          <div class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#E9F8F6] text-[#16847F]"><BriefcaseBusiness class="size-5" /></div>
          <div><p class="text-xs font-bold uppercase tracking-wide text-[#16847F]">Step 2</p><h2 class="mt-1 text-lg font-bold text-[#102A43] dark:text-white">Requirement Profile</h2><p class="mt-1 text-sm text-surface-500">Review AI-extracted information and add any business context that was not stated in the JD.</p></div>
        </div>

        <div v-if="profileExtracted" class="mb-5 rounded-xl border border-[#CFE0ED] bg-[#F7FBFE] px-4 py-3 text-xs text-[#486581] dark:border-surface-700 dark:bg-surface-800 dark:text-surface-300"><Sparkles class="mr-1 inline size-3.5 text-[#2E86C1]" />These fields were populated from the uploaded JD where evidence was available. Nothing is locked; recruiter review remains authoritative.</div>

        <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <label class="block lg:col-span-2"><span class="mb-1.5 block text-sm font-semibold text-surface-700 dark:text-surface-200">Job Title <span class="text-danger-500">*</span></span><input v-model="form.title" maxlength="200" placeholder="e.g. Account Manager - Enterprise" class="w-full rounded-xl border border-surface-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-surface-700 dark:bg-surface-950" /></label>
          <label class="block"><span class="mb-1.5 block text-sm font-semibold text-surface-700 dark:text-surface-200">Function</span><input v-model="form.functionName" maxlength="300" placeholder="e.g. Sales" class="w-full rounded-xl border border-surface-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-surface-700 dark:bg-surface-950" /></label>
          <label class="block"><span class="mb-1.5 block text-sm font-semibold text-surface-700 dark:text-surface-200">Hiring Manager</span><input v-model="form.hiringManager" maxlength="300" placeholder="Name / designation" class="w-full rounded-xl border border-surface-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-surface-700 dark:bg-surface-950" /></label>
          <label class="block"><span class="mb-1.5 block text-sm font-semibold text-surface-700 dark:text-surface-200">Location</span><input v-model="form.location" maxlength="500" placeholder="e.g. Hyderabad" class="w-full rounded-xl border border-surface-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-surface-700 dark:bg-surface-950" /></label>
          <label class="block"><span class="mb-1.5 block text-sm font-semibold text-surface-700 dark:text-surface-200">Employment Type</span><select v-model="form.type" class="w-full rounded-xl border border-surface-300 bg-white px-3 py-2.5 text-sm dark:border-surface-700 dark:bg-surface-950"><option value="full_time">Full-time</option><option value="part_time">Part-time</option><option value="contract">Contract</option><option value="internship">Internship</option></select></label>
          <label class="block"><span class="mb-1.5 block text-sm font-semibold text-surface-700 dark:text-surface-200">Experience Requirement</span><input v-model="form.experienceRequirement" maxlength="500" placeholder="e.g. 10-15 years" class="w-full rounded-xl border border-surface-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-surface-700 dark:bg-surface-950" /></label>
          <label class="block"><span class="mb-1.5 block text-sm font-semibold text-surface-700 dark:text-surface-200">Seniority</span><select v-model="form.experienceLevel" class="w-full rounded-xl border border-surface-300 bg-white px-3 py-2.5 text-sm dark:border-surface-700 dark:bg-surface-950"><option value="junior">Junior</option><option value="mid">Mid-level</option><option value="senior">Senior</option><option value="lead">Lead / Leadership</option></select></label>
          <label class="block"><span class="mb-1.5 block text-sm font-semibold text-surface-700 dark:text-surface-200">Openings <span class="text-danger-500">*</span></span><input v-model.number="form.openings" type="number" min="1" max="500" class="w-full rounded-xl border border-surface-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 dark:border-surface-700 dark:bg-surface-950" /></label>
          <label class="block"><span class="mb-1.5 block text-sm font-semibold text-surface-700 dark:text-surface-200">Target Closure Date</span><input v-model="form.closureDate" type="date" class="w-full rounded-xl border border-surface-300 bg-white px-3 py-2.5 text-sm dark:border-surface-700 dark:bg-surface-950" /><span class="mt-1 block text-xs text-surface-400">If blank, Allocation Management can set the target when a recruiter is assigned.</span></label>
        </div>

        <label class="mt-5 block"><span class="mb-1.5 flex items-center justify-between text-sm font-semibold text-surface-700 dark:text-surface-200"><span>Major Requirements</span><span class="text-xs font-normal text-surface-400">{{ majorRequirementCount }}/20</span></span><textarea v-model="form.majorRequirements" rows="6" maxlength="5000" placeholder="One major requirement per line\nExample: Complex enterprise sales cycles\nHigh-value closure ownership\nC-level customer relationships" class="w-full rounded-xl border border-surface-300 bg-white px-3 py-3 text-sm leading-6 outline-none focus:border-brand-500 dark:border-surface-700 dark:bg-surface-950" /><span class="mt-1 block text-xs text-surface-400">These provide business context for later requirement assessment. The approved Skill Matrix remains the scoring authority.</span></label>
      </section>

      <section class="sticky bottom-4 rounded-2xl border border-[#CFE0ED] bg-white/95 p-4 shadow-xl backdrop-blur dark:border-surface-700 dark:bg-surface-900/95 sm:flex sm:items-center sm:justify-between sm:gap-5">
        <div>
          <p class="text-sm font-bold text-[#102A43] dark:text-white">Next: Review AI Skill Matrix</p>
          <p class="mt-1 text-xs text-surface-500">The new requirement stays unallocated until you assign a recruiter through Allocation Management.</p>
        </div>
        <button type="submit" :disabled="creating || parsingJd || !setupReady" class="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#1F6FA3] px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-[#185D89] disabled:cursor-not-allowed disabled:opacity-40 sm:mt-0 sm:w-auto"><Loader2 v-if="creating" class="size-4 animate-spin" /><Sparkles v-else class="size-4" />{{ creating ? 'Creating Requirement…' : 'Create & Review Skill Matrix' }}</button>
      </section>
    </form>
  </div>
</template>
