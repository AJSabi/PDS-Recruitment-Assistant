<script setup lang="ts">
import { Save, CheckCircle2, Plus, Trash2, FileText, ShieldCheck, WandSparkles, Loader2, Sparkles } from 'lucide-vue-next'

const route = useRoute()
const jobId = route.params.id as string
const toast = useToast()
const { job, status: jobFetchStatus, error: jobError, updateJob } = useJob(jobId)

type Priority = 'mandatory' | 'preferred' | 'optional'
type Skill = { id: string; skill: string; priority: Priority; rationale?: string }
type Classification = { id: string; name: string; skills: Skill[] }
type Matrix = { classifications: Classification[] }

const { data, status: matrixFetchStatus, refresh } = useFetch(() => `/api/jobs/${jobId}/skill-matrix`, {
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

watch(job, (value: any) => {
  if (!value) return
  const description = value.description ?? ''
  if (!jdDraft.value && !savedJd.value) jdDraft.value = description
  savedJd.value = description
}, { immediate: true })

watch(data, (value: any) => {
  if (!value) return
  matrix.value = value.matrix ?? { classifications: [] }
  approved.value = Boolean(value.approved)
  dirty.value = false
}, { immediate: true })

watch(matrix, () => { dirty.value = true }, { deep: true })

const jdDirty = computed(() => jdDraft.value !== savedJd.value)
const totalSkills = computed(() => matrix.value.classifications.flatMap(c => c.skills).length)
const mandatoryCount = computed(() => matrix.value.classifications.flatMap(c => c.skills).filter(s => s.priority === 'mandatory').length)

function slug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 80) || crypto.randomUUID()
}

async function saveActiveJd() {
  const jd = jdDraft.value.trim()
  if (!jd) return toast.warning('JD required', 'Paste or write a Job Description first.')
  isSavingJd.value = true
  try {
    await updateJob({ description: jd } as any)
    jdDraft.value = jd
    savedJd.value = jd
    toast.success('Active JD saved')
  } catch (err: any) {
    toast.error('Could not save JD', { message: err?.data?.statusMessage ?? err?.message })
  } finally { isSavingJd.value = false }
}

async function generateAiMatrix() {
  if (jdDirty.value || !savedJd.value.trim()) return toast.warning('Save Active JD first', 'AI must analyse the saved Active JD.')
  if (matrix.value.classifications.length && !confirm('Replace the current Skill Matrix draft with a new AI proposal?')) return
  isGenerating.value = true
  try {
    const result: any = await $fetch(`/api/jobs/${jobId}/skill-matrix/generate`, { method: 'POST' })
    matrix.value = result.matrix
    approved.value = false
    dirty.value = true
    toast.success('AI Skill Matrix generated', { message: 'Review and edit the proposal before approval.' })
  } catch (err: any) {
    toast.error('AI Skill Matrix could not be generated', { message: err?.data?.statusMessage ?? err?.message })
  } finally { isGenerating.value = false }
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
  if (count < 4 || count > 5) return 'An approved Skill Matrix must contain 4–5 classifications.'
  let mandatory = 0
  for (const c of matrix.value.classifications) {
    if (!c.name.trim()) return 'Every classification needs a name.'
    if (!c.skills.length) return `${c.name} needs at least one skill.`
    if (c.skills.some(s => !s.skill.trim())) return `A skill under ${c.name} is blank.`
    const m = c.skills.filter(s => s.priority === 'mandatory').length
    if (m < 2 || m > 3) return `${c.name} must contain 2–3 Mandatory skills before approval.`
    mandatory += m
  }
  if (mandatory < 8 || mandatory > 12) return 'Use 8–12 Mandatory skills overall before approval.'
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
    toast.success(approve ? 'Skill Matrix approved' : 'Draft saved')
  } catch (err: any) {
    toast.error('Could not save Skill Matrix', { message: err?.data?.statusMessage ?? err?.message })
  } finally { isSaving.value = false }
}
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <JobSubNavActions :job-id="jobId" />
    <div v-if="jobFetchStatus === 'pending' || matrixFetchStatus === 'pending'" class="py-12 text-center text-surface-400">Loading…</div>
    <div v-else-if="jobError" class="rounded-lg border border-danger-200 bg-danger-50 p-4 text-danger-700">Failed to load job.</div>
    <template v-else-if="job">
      <div class="mb-6">
        <div class="flex items-center gap-2">
          <h1 class="text-2xl font-bold text-surface-900 dark:text-surface-50">JD & Skill Matrix</h1>
          <span v-if="approved" class="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-1 text-xs font-medium text-success-700 ring-1 ring-success-200"><ShieldCheck class="size-3.5" /> Approved</span>
        </div>
        <p class="mt-1 text-sm text-surface-500">AI can propose the Skill Matrix from the Active JD. Recruiter review and explicit approval remain mandatory before candidate analysis.</p>
      </div>

      <section class="mb-6 rounded-xl border border-surface-200 bg-white p-5 dark:border-surface-800 dark:bg-surface-900">
        <div class="mb-4 flex items-center justify-between">
          <div><p class="text-sm font-semibold">Active Requirement</p><p class="mt-1 text-sm text-surface-500"><strong>{{ job.title }}</strong><span v-if="job.location"> · {{ job.location }}</span></p></div>
          <span class="text-xs text-surface-400">{{ matrix.classifications.length }} classifications · {{ totalSkills }} skills · {{ mandatoryCount }} mandatory</span>
        </div>

        <div class="rounded-lg border border-surface-200 bg-surface-50 p-4 dark:border-surface-700 dark:bg-surface-800/50">
          <div class="mb-2 flex items-center gap-2"><FileText class="size-4 text-brand-600" /><h2 class="text-sm font-semibold">Active JD</h2><span v-if="jdDirty" class="rounded-full bg-warning-50 px-2 py-0.5 text-xs text-warning-700">Unsaved changes</span><span v-else-if="savedJd" class="rounded-full bg-success-50 px-2 py-0.5 text-xs text-success-700">Saved</span></div>
          <textarea v-model="jdDraft" rows="10" placeholder="Paste or write the Job Description here." class="w-full rounded-lg border border-surface-300 bg-white px-3 py-3 text-sm leading-relaxed dark:border-surface-700 dark:bg-surface-900" />
          <div class="mt-3 flex justify-end"><button type="button" :disabled="isSavingJd || !jdDraft.trim() || !jdDirty" class="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40" @click="saveActiveJd"><Save class="size-4" /> Save Active JD</button></div>
        </div>

        <div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p class="text-xs text-surface-500">Generate with AI for the first draft, then edit classifications, priorities and rationale before approval.</p>
          <div class="flex flex-wrap gap-2">
            <button type="button" :disabled="isGenerating || jdDirty || !savedJd.trim()" class="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40" @click="generateAiMatrix"><Loader2 v-if="isGenerating" class="size-4 animate-spin" /><Sparkles v-else class="size-4" />{{ isGenerating ? 'Generating…' : (matrix.classifications.length ? 'Regenerate with AI' : 'Generate with AI') }}</button>
            <button type="button" :disabled="isGenerating || jdDirty || !savedJd.trim()" class="inline-flex items-center gap-2 rounded-lg border border-surface-300 px-4 py-2 text-sm font-medium disabled:opacity-40 dark:border-surface-700" @click="createManualMatrix"><WandSparkles class="size-4" />Manual Matrix</button>
          </div>
        </div>
      </section>

      <div v-if="!matrix.classifications.length" class="rounded-xl border-2 border-dashed border-surface-200 p-10 text-center dark:border-surface-800"><h2 class="font-semibold">No Skill Matrix yet</h2><p class="mt-1 text-sm text-surface-500">Generate an AI proposal from the saved Active JD or create the matrix manually.</p></div>

      <div v-else class="space-y-4">
        <section v-for="(classification, ci) in matrix.classifications" :key="classification.id" class="rounded-xl border border-surface-200 bg-white p-5 dark:border-surface-800 dark:bg-surface-900">
          <div class="mb-4 flex items-center gap-3"><input v-model="classification.name" class="min-w-0 flex-1 rounded-lg border border-surface-300 px-3 py-2 font-semibold dark:border-surface-700 dark:bg-surface-800" /><span class="text-xs text-surface-400">{{ classification.skills.filter(s => s.priority === 'mandatory').length }}/3 mandatory</span><button type="button" class="rounded-lg p-2 text-danger-500" @click="removeClassification(ci)"><Trash2 class="size-4" /></button></div>
          <div class="space-y-3">
            <div v-for="(skill, si) in classification.skills" :key="skill.id" class="grid grid-cols-1 gap-2 rounded-lg bg-surface-50 p-3 md:grid-cols-[1.4fr_160px_2fr_36px] md:items-center dark:bg-surface-800/60">
              <input v-model="skill.skill" placeholder="Skill / requirement" class="rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-900" />
              <select v-model="skill.priority" class="rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-900"><option value="mandatory">Mandatory</option><option value="preferred">Preferred</option><option value="optional">Optional</option></select>
              <input v-model="skill.rationale" placeholder="Why this matters / evidence expected" class="rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-900" />
              <button type="button" class="rounded-lg p-2 text-surface-400 hover:text-danger-500" @click="removeSkill(classification, si)"><Trash2 class="size-4" /></button>
            </div>
          </div>
          <button type="button" :disabled="classification.skills.length >= 8" class="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 disabled:opacity-40" @click="addSkill(classification)"><Plus class="size-4" /> Add skill</button>
        </section>

        <button v-if="matrix.classifications.length < 5" type="button" class="inline-flex items-center gap-1 rounded-lg border border-dashed border-surface-300 px-4 py-2 text-sm font-medium" @click="addClassification"><Plus class="size-4" /> Add classification</button>
        <div class="sticky bottom-4 flex flex-col gap-3 rounded-xl border border-surface-200 bg-white/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between dark:border-surface-800 dark:bg-surface-900/95"><p class="text-xs text-surface-500"><span v-if="dirty">Unsaved changes. </span>AI output is a proposal only. Approval requires 4–5 classifications, 2–3 Mandatory skills per classification, and 8–12 Mandatory skills overall.</p><div class="flex gap-2"><button type="button" :disabled="isSaving || isGenerating" class="inline-flex items-center gap-2 rounded-lg border border-surface-300 px-4 py-2 text-sm font-medium disabled:opacity-50" @click="persist(false)"><Save class="size-4" /> Save Draft</button><button type="button" :disabled="isSaving || isGenerating" class="inline-flex items-center gap-2 rounded-lg bg-success-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" @click="persist(true)"><CheckCircle2 class="size-4" /> Approve Skill Matrix</button></div></div>
      </div>
    </template>
  </div>
</template>
