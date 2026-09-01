<script setup lang="ts">
import { AlertTriangle, CheckCircle2, Database, FileText, Loader2, Plus, Save, ShieldCheck, Sparkles, Trash2, UserPlus, WandSparkles } from 'lucide-vue-next'

const route = useRoute()
const jobId = route.params.id as string
const toast = useToast()
const localePath = useLocalePath()
const { job, status: jobFetchStatus, error: jobError, updateJob } = useJob(jobId)

type Priority = 'mandatory' | 'preferred' | 'optional'
type Skill = { id: string; skill: string; priority: Priority; rationale?: string }
type Classification = { id: string; name: string; skills: Skill[] }
type Matrix = { classifications: Classification[] }

const { data, status: matrixFetchStatus, error: matrixError, refresh } = useFetch(() => `/api/jobs/${jobId}/skill-matrix`, {
  key: `skill-matrix-${jobId}`,
  headers: useRequestHeaders(['cookie']),
})

const jdDraft = ref('')
const savedJd = ref('')
const matrix = ref<Matrix>({ classifications: [] })
const approved = ref(false)
const isSavingJd = ref(false)
const isSaving = ref(false)
const isGenerating = ref(false)
const dirty = ref(false)
const showAddCandidate = ref(false)
let syncingMatrixFromServer = false

watch(job, (value: any) => {
  if (!value) return
  const description = value.description ?? ''
  if (!jdDraft.value && !savedJd.value) jdDraft.value = description
  savedJd.value = description
}, { immediate: true })

watch(data, (value: any) => {
  if (!value) return
  syncingMatrixFromServer = true
  matrix.value = value.matrix ?? { classifications: [] }
  approved.value = Boolean(value.approved)
  dirty.value = false
  syncingMatrixFromServer = false
}, { immediate: true })

watch(matrix, () => {
  if (!syncingMatrixFromServer) dirty.value = true
}, { deep: true, flush: 'sync' })

const jdDirty = computed(() => jdDraft.value !== savedJd.value)
const totalSkills = computed(() => matrix.value.classifications.flatMap(c => c.skills).length)
const mandatoryCount = computed(() => matrix.value.classifications.flatMap(c => c.skills).filter(s => s.priority === 'mandatory').length)
const preferredCount = computed(() => matrix.value.classifications.flatMap(c => c.skills).filter(s => s.priority === 'preferred').length)
const optionalCount = computed(() => matrix.value.classifications.flatMap(c => c.skills).filter(s => s.priority === 'optional').length)
const approvalError = computed(() => validate(true))
const approvalReady = computed(() => Boolean(savedJd.value.trim()) && !jdDirty.value && !approvalError.value)
const approvalCurrent = computed(() => approved.value && !dirty.value)

function slug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 80) || crypto.randomUUID()
}

async function generateAiMatrix() {
  if (jdDirty.value || !savedJd.value.trim()) {
    toast.warning('Save Active JD first', 'AI must analyse the saved Active JD.')
    return
  }
  if (matrix.value.classifications.length && !confirm('Replace the current Skill Matrix draft with a new AI proposal?')) return

  isGenerating.value = true
  try {
    const result: any = await $fetch(`/api/jobs/${jobId}/skill-matrix/generate`, { method: 'POST' })
    matrix.value = result.matrix
    approved.value = false
    dirty.value = true
    toast.success('AI Skill Matrix generated', { message: 'Review and edit the JD-specific proposal before approval.' })
  } catch (err: any) {
    toast.error('AI Skill Matrix could not be generated', { message: err?.data?.statusMessage ?? err?.message ?? 'Generation failed.' })
  } finally { isGenerating.value = false }
}

async function saveActiveJd() {
  const jd = jdDraft.value.trim()
  if (!jd) return toast.warning('JD required', 'Paste or write a Job Description first.')
  isSavingJd.value = true
  try {
    await updateJob({ description: jd } as any)
    jdDraft.value = jd
    savedJd.value = jd
    toast.success('Active JD saved', { message: 'Use Generate with AI when you are ready to spend an AI call on the Skill Matrix.' })
  } catch (err: any) {
    toast.error('Could not save JD', { message: err?.data?.statusMessage ?? err?.message })
  } finally { isSavingJd.value = false }
}

function createManualMatrix() {
  if (!savedJd.value.trim()) return toast.warning('Save Active JD first', 'Save the JD before creating the Skill Matrix.')
  if (matrix.value.classifications.length && !confirm('Replace the current Skill Matrix with a new manual draft?')) return
  matrix.value = {
    classifications: Array.from({ length: 4 }, (_, i) => ({
      id: `classification_${i + 1}`,
      name: `Classification ${i + 1}`,
      skills: [{ id: `classification_${i + 1}_skill_1`, skill: '', priority: 'mandatory' as Priority, rationale: '' }],
    })),
  }
  approved.value = false
  dirty.value = true
}

function addClassification() {
  if (matrix.value.classifications.length >= 5) return
  const n = matrix.value.classifications.length + 1
  matrix.value.classifications.push({ id: `classification_${Date.now()}`, name: `Classification ${n}`, skills: [] })
}
function removeClassification(index: number) { matrix.value.classifications.splice(index, 1) }
function addSkill(c: Classification) {
  if (c.skills.length >= 8) return
  c.skills.push({ id: `skill_${Date.now()}_${c.skills.length}`, skill: '', priority: 'preferred', rationale: '' })
}
function removeSkill(c: Classification, index: number) { c.skills.splice(index, 1) }

function normalizeIds() {
  matrix.value.classifications.forEach((c, ci) => {
    c.id = slug(c.name || `classification_${ci + 1}`)
    c.skills.forEach((s, si) => { s.id = `${c.id}_${slug(s.skill || `skill_${si + 1}`)}` })
  })
}

function validate(approve: boolean): string | null {
  if (!approve) return null
  const count = matrix.value.classifications.length
  if (count < 4 || count > 5) return 'An approved Skill Matrix must contain 4–5 role-relevant classifications.'
  let mandatory = 0
  for (const c of matrix.value.classifications) {
    if (!c.name.trim()) return 'Every classification needs a name.'
    if (!c.skills.length) return `${c.name} needs at least one assessable skill.`
    if (c.skills.some(s => !s.skill.trim())) return `A skill under ${c.name} is blank.`
    mandatory += c.skills.filter(s => s.priority === 'mandatory').length
  }
  if (mandatory < 1) return 'Mark at least one genuinely role-critical criterion as Mandatory before approval.'
  return null
}

async function persist(approve: boolean) {
  const error = validate(approve)
  if (error) return toast.warning('Review Skill Matrix', error)
  normalizeIds()
  isSaving.value = true
  try {
    await $fetch(`/api/jobs/${jobId}/skill-matrix`, { method: 'PUT', body: { matrix: matrix.value, approved: approve } })
    approved.value = approve
    dirty.value = false
    await refresh()

    if (!approve) {
      toast.success('Draft saved')
      return
    }

    toast.success('Skill Matrix approved', { message: 'Choose how to source candidates next. Existing Candidate Database matching will run only when a recruiter explicitly requests an AI refresh.' })
  } catch (err: any) {
    toast.error('Could not save Skill Matrix', { message: err?.data?.statusMessage ?? err?.message })
  } finally { isSaving.value = false }
}
</script>

<template>
  <div class="space-y-6">
    <JobSubNavActions :job-id="jobId" />

    <div v-if="jobFetchStatus === 'pending' || matrixFetchStatus === 'pending'" class="rounded-2xl border border-surface-200 bg-white py-12 text-center text-surface-400 dark:border-surface-800 dark:bg-surface-900">Loading JD and Skill Matrix…</div>
    <div v-else-if="jobError || matrixError" class="rounded-2xl border border-danger-200 bg-danger-50 p-4 text-danger-700">
      <p class="font-semibold">JD & Skill Matrix could not be loaded.</p>
      <p class="mt-1 text-sm">{{ (jobError?.data as { statusMessage?: string } | undefined)?.statusMessage ?? (matrixError?.data as { statusMessage?: string } | undefined)?.statusMessage ?? 'Please retry. If this continues, the requirement API needs attention.' }}</p>
    </div>

    <template v-else-if="job">
      <section class="rounded-2xl border border-[#CFE0ED] bg-white p-5 shadow-sm dark:border-surface-800 dark:bg-surface-900">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div class="flex items-center gap-2"><FileText class="size-5 text-[#2E86C1]" /><h2 class="font-bold text-[#102A43] dark:text-white">1. Active Job Description</h2></div>
            <p class="mt-1 text-sm text-surface-500">This saved JD is the source AI uses to propose the Skill Matrix. Edit it here before regenerating the matrix.</p>
          </div>
          <span v-if="jdDirty" class="rounded-full bg-warning-50 px-3 py-1 text-xs font-bold text-warning-700">Unsaved changes</span>
          <span v-else-if="savedJd" class="inline-flex items-center gap-1 rounded-full bg-[#E9F8F6] px-3 py-1 text-xs font-bold text-[#13756F]"><CheckCircle2 class="size-3.5" />JD saved</span>
        </div>

        <textarea v-model="jdDraft" rows="12" placeholder="Paste or write the Job Description here." class="mt-4 w-full rounded-xl border border-surface-300 bg-[#FBFDFF] px-4 py-4 text-sm leading-6 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-surface-700 dark:bg-surface-950" />

        <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p class="text-xs text-surface-500"><strong>{{ job.title }}</strong><span v-if="job.location"> · {{ job.location }}</span></p>
          <button type="button" :disabled="isSavingJd || !jdDraft.trim() || !jdDirty" class="inline-flex items-center gap-2 rounded-lg bg-[#2E86C1] px-4 py-2 text-sm font-bold text-white disabled:opacity-40" @click="saveActiveJd"><Loader2 v-if="isSavingJd" class="size-4 animate-spin" /><Save v-else class="size-4" />{{ isSavingJd ? 'Saving…' : 'Save Active JD' }}</button>
        </div>
      </section>

      <section class="rounded-2xl border border-[#CFE0ED] bg-white p-5 shadow-sm dark:border-surface-800 dark:bg-surface-900">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div class="flex items-center gap-2"><Sparkles class="size-5 text-[#16847F]" /><h2 class="font-bold text-[#102A43] dark:text-white">2. AI Skill Matrix</h2></div>
            <p class="mt-1 max-w-3xl text-sm text-surface-500">AI proposes JD-specific, assessable evidence criteria. It runs only when you explicitly click Generate with AI. Recruiter review and approval remain mandatory.</p>
          </div>
          <span v-if="approvalCurrent" class="inline-flex items-center gap-1 rounded-full bg-[#E9F8F6] px-3 py-1 text-xs font-bold text-[#13756F]"><ShieldCheck class="size-3.5" />Approved</span>
          <span v-else class="rounded-full bg-[#FFF7E8] px-3 py-1 text-xs font-bold text-[#976511]">Review required</span>
        </div>

        <div class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div class="rounded-xl bg-[#F6F9FC] p-3 dark:bg-surface-800/60"><p class="text-[10px] font-bold uppercase tracking-wide text-surface-400">Classifications</p><p class="mt-1 text-2xl font-black text-[#102A43] dark:text-white">{{ matrix.classifications.length }}</p><p class="text-xs text-surface-400">4–5 role dimensions</p></div>
          <div class="rounded-xl bg-[#EAF4FB] p-3 dark:bg-brand-950/20"><p class="text-[10px] font-bold uppercase tracking-wide text-[#1F6FA3]">Mandatory</p><p class="mt-1 text-2xl font-black text-[#1F6FA3]">{{ mandatoryCount }}</p><p class="text-xs text-[#6389A7]">Only genuine hiring gates</p></div>
          <div class="rounded-xl bg-[#F4FBFA] p-3 dark:bg-surface-800/60"><p class="text-[10px] font-bold uppercase tracking-wide text-[#16847F]">Preferred</p><p class="mt-1 text-2xl font-black text-[#16847F]">{{ preferredCount }}</p><p class="text-xs text-surface-400">Important differentiators</p></div>
          <div class="rounded-xl bg-[#F6F9FC] p-3 dark:bg-surface-800/60"><p class="text-[10px] font-bold uppercase tracking-wide text-surface-400">Optional</p><p class="mt-1 text-2xl font-black text-[#102A43] dark:text-white">{{ optionalCount }}</p><p class="text-xs text-surface-400">Genuine advantages only</p></div>
        </div>

        <div class="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#D7E9E7] bg-[#F4FBFA] p-4 dark:border-surface-700 dark:bg-surface-800/40">
          <div><p class="text-sm font-bold text-[#102A43] dark:text-white">Generate from the saved JD</p><p class="mt-1 text-xs text-surface-500">This is an explicit AI action. Regeneration replaces the current draft; Manual Override remains available.</p></div>
          <div class="flex flex-wrap gap-2">
            <button type="button" :disabled="isGenerating || jdDirty || !savedJd.trim()" class="inline-flex items-center gap-2 rounded-lg bg-[#16847F] px-4 py-2 text-sm font-bold text-white disabled:opacity-40" @click="generateAiMatrix"><Loader2 v-if="isGenerating" class="size-4 animate-spin" /><Sparkles v-else class="size-4" />{{ isGenerating ? 'Generating…' : (matrix.classifications.length ? 'Regenerate with AI' : 'Generate with AI') }}</button>
            <button type="button" :disabled="isGenerating || jdDirty || !savedJd.trim()" class="inline-flex items-center gap-2 rounded-lg border border-surface-300 px-4 py-2 text-sm font-semibold disabled:opacity-40 dark:border-surface-700" @click="createManualMatrix"><WandSparkles class="size-4" />Manual Override</button>
          </div>
        </div>
      </section>

      <div v-if="!matrix.classifications.length" class="rounded-2xl border-2 border-dashed border-[#CFE0ED] bg-white p-10 text-center dark:border-surface-800 dark:bg-surface-900">
        <Loader2 v-if="isGenerating" class="mx-auto mb-3 size-6 animate-spin text-[#2E86C1]" />
        <Sparkles v-else class="mx-auto mb-3 size-6 text-[#2E86C1]" />
        <h2 class="font-bold text-[#102A43] dark:text-white">{{ isGenerating ? 'AI is preparing the Skill Matrix' : 'No Skill Matrix yet' }}</h2>
        <p class="mx-auto mt-1 max-w-xl text-sm text-surface-500">{{ isGenerating ? 'The saved JD is being converted into role-relevant, evidence-based classifications and skills.' : 'Save the Active JD, then click Generate with AI or use Manual Override. Opening or refreshing this page will not spend AI credits.' }}</p>
      </div>

      <section v-else class="space-y-4">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div><h2 class="text-lg font-bold text-[#102A43] dark:text-white">3. Review classifications and evidence</h2><p class="mt-1 text-sm text-surface-500">Edit AI suggestions where necessary. Mandatory means a genuine hiring gate supported by the JD; there is no quota per classification.</p></div>
          <span class="text-xs text-surface-400">{{ totalSkills }} total skills</span>
        </div>

        <article v-for="(classification, ci) in matrix.classifications" :key="classification.id" class="overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-sm dark:border-surface-800 dark:bg-surface-900">
          <div class="flex flex-wrap items-center gap-3 border-b border-surface-100 bg-[#F8FBFD] px-5 py-4 dark:border-surface-800 dark:bg-surface-800/40">
            <div class="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#102A43] text-xs font-black text-white">{{ ci + 1 }}</div>
            <input v-model="classification.name" class="min-w-[220px] flex-1 rounded-lg border border-surface-300 bg-white px-3 py-2 font-bold text-[#102A43] dark:border-surface-700 dark:bg-surface-900 dark:text-white" />
            <span class="rounded-full bg-[#EAF4FB] px-2.5 py-1 text-xs font-bold text-[#1F6FA3]">{{ classification.skills.filter(s => s.priority === 'mandatory').length }} Mandatory</span>
            <button type="button" class="rounded-lg p-2 text-surface-400 hover:bg-danger-50 hover:text-danger-600" title="Remove classification" @click="removeClassification(ci)"><Trash2 class="size-4" /></button>
          </div>

          <div class="space-y-3 p-5">
            <div v-for="(skill, si) in classification.skills" :key="skill.id" class="rounded-xl border border-surface-200 p-3 dark:border-surface-700">
              <div class="grid grid-cols-1 gap-2 md:grid-cols-[1.2fr_150px_1.8fr_36px] md:items-center">
                <input v-model="skill.skill" placeholder="Specific hiring criterion" class="rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm font-semibold dark:border-surface-700 dark:bg-surface-900" />
                <select v-model="skill.priority" class="rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm font-semibold dark:border-surface-700 dark:bg-surface-900"><option value="mandatory">Mandatory</option><option value="preferred">Preferred</option><option value="optional">Optional</option></select>
                <input v-model="skill.rationale" placeholder="Evidence expected: ownership, scale, outcome, domain…" class="rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-900" />
                <button type="button" class="rounded-lg p-2 text-surface-400 hover:text-danger-500" title="Remove skill" @click="removeSkill(classification, si)"><Trash2 class="size-4" /></button>
              </div>
            </div>
            <button type="button" :disabled="classification.skills.length >= 8" class="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[#9FC7DF] px-3 py-2 text-sm font-semibold text-[#1F6FA3] disabled:opacity-40" @click="addSkill(classification)"><Plus class="size-4" />Add skill</button>
          </div>
        </article>

        <button v-if="matrix.classifications.length < 5" type="button" class="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-[#9FC7DF] bg-white px-4 py-3 text-sm font-bold text-[#1F6FA3] dark:bg-surface-900" @click="addClassification"><Plus class="size-4" />Add classification</button>
      </section>

      <section v-if="approved" class="rounded-2xl border border-[#CFE0ED] bg-white p-5 shadow-sm dark:border-surface-800 dark:bg-surface-900">
        <div>
          <h2 class="text-lg font-bold text-[#102A43] dark:text-white">4. Choose candidate sourcing method</h2>
          <p class="mt-1 max-w-3xl text-sm text-surface-500">The recruiter can work directly with resumes for this requirement or use the AI Candidate Pool. The central Candidate Database is never scanned automatically after approval or page refresh.</p>
        </div>
        <div class="mt-4 grid gap-4 lg:grid-cols-2">
          <div class="rounded-2xl border border-[#B8E2DE] bg-[#F4FBFA] p-5 dark:border-surface-700 dark:bg-surface-800/40">
            <div class="flex items-start gap-3"><UserPlus class="mt-0.5 size-5 text-[#16847F]" /><div><p class="font-bold text-[#102A43] dark:text-white">Attach candidate / resume directly</p><p class="mt-1 text-sm leading-6 text-surface-500">Add a new or existing candidate directly to this requirement. With a resume, AI evaluates only that candidate against the approved JD and Skill Matrix and immediately shows the match percentage. The recruiter may still validate the candidate through Recruiter Screening regardless of the AI score.</p></div></div>
            <button type="button" class="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#16847F] px-4 py-2.5 text-sm font-bold text-white" @click="showAddCandidate = true"><UserPlus class="size-4" />Add Candidate / Resume</button>
          </div>
          <div class="rounded-2xl border border-[#BED9E9] bg-[#F7FBFE] p-5 dark:border-surface-700 dark:bg-surface-800/40">
            <div class="flex items-start gap-3"><Database class="mt-0.5 size-5 text-[#2E86C1]" /><div><p class="font-bold text-[#102A43] dark:text-white">Use AI Candidate Pool</p><p class="mt-1 text-sm leading-6 text-surface-500">Open the Candidate Pool to review existing cached matches or explicitly ask AI to refresh the central Candidate Database. AI database refresh runs only when the recruiter presses Refresh Database Matches.</p></div></div>
            <a :href="localePath(`/dashboard/jobs/${jobId}/pds-ranking`)" class="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#2E86C1] px-4 py-2.5 text-sm font-bold text-white no-underline"><Database class="size-4" />Open AI Candidate Pool</a>
          </div>
        </div>
      </section>

      <section v-if="matrix.classifications.length" class="sticky bottom-4 z-10 rounded-2xl border border-[#CFE0ED] bg-white/95 p-4 shadow-xl backdrop-blur dark:border-surface-800 dark:bg-surface-900/95">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <template v-if="approvalCurrent">
            <div class="flex items-start gap-2 text-sm text-[#13756F]"><ShieldCheck class="mt-0.5 size-4 shrink-0" /><div><p class="font-bold">Skill Matrix approved</p><p class="mt-0.5 text-xs text-surface-500">The current saved matrix is the approved hiring baseline. Edit it only when the requirement changes.</p></div></div>
            <div class="inline-flex items-center gap-2 rounded-lg bg-[#E9F8F6] px-4 py-2 text-sm font-bold text-[#13756F]"><CheckCircle2 class="size-4" />Approved</div>
          </template>
          <template v-else>
            <div class="min-w-0">
              <div v-if="approvalReady" class="flex items-start gap-2 text-sm text-[#13756F]"><CheckCircle2 class="mt-0.5 size-4 shrink-0" /><div><p class="font-bold">Ready for approval</p><p class="mt-0.5 text-xs text-surface-500">Approval establishes this JD-specific evidence framework. It does not automatically refresh the Candidate Database.</p></div></div>
              <div v-else class="flex items-start gap-2 text-sm text-warning-700"><AlertTriangle class="mt-0.5 size-4 shrink-0" /><div><p class="font-bold">Review required before approval</p><p class="mt-0.5 text-xs text-surface-500">{{ jdDirty ? 'Save the Active JD before approving the matrix.' : (approvalError || 'Review the current AI proposal before approval.') }}</p></div></div>
            </div>
            <div class="flex shrink-0 flex-wrap gap-2">
              <button type="button" :disabled="isSaving || isGenerating" class="inline-flex items-center gap-2 rounded-lg border border-surface-300 px-4 py-2 text-sm font-bold disabled:opacity-50" @click="persist(false)"><Save class="size-4" />Save Draft</button>
              <button type="button" :disabled="isSaving || isGenerating || !approvalReady" class="inline-flex items-center gap-2 rounded-lg bg-[#16847F] px-4 py-2 text-sm font-bold text-white disabled:opacity-40" @click="persist(true)"><CheckCircle2 class="size-4" />Approve Skill Matrix</button>
            </div>
          </template>
        </div>
      </section>
    </template>

    <ApplyCandidateModal
      v-if="showAddCandidate"
      :job-id="jobId"
      @close="showAddCandidate = false"
      @created="showAddCandidate = false"
    />
  </div>
</template>
