<script setup lang="ts">
import { Sparkles, Loader2, Save, CheckCircle2, Plus, Trash2, ShieldCheck } from 'lucide-vue-next'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'require-org'] })

const route = useRoute()
const jobId = route.params.id as string
const toast = useToast()
const { job, status: jobFetchStatus, error: jobError } = useJob(jobId)

type Priority = 'mandatory' | 'preferred' | 'optional'
type Skill = { id: string; skill: string; priority: Priority; rationale?: string }
type Classification = { id: string; name: string; skills: Skill[] }
type Matrix = { classifications: Classification[] }

const { data, status: matrixFetchStatus, refresh } = useFetch(() => `/api/jobs/${jobId}/skill-matrix`, {
  key: `skill-matrix-${jobId}`,
  headers: useRequestHeaders(['cookie']),
})

const matrix = ref<Matrix>({ classifications: [] })
const approved = ref(false)
const isGenerating = ref(false)
const isSaving = ref(false)
const dirty = ref(false)

watch(data, (value: any) => {
  if (!value) return
  matrix.value = value.matrix ?? { classifications: [] }
  approved.value = Boolean(value.approved)
  dirty.value = false
}, { immediate: true })

watch(matrix, () => { dirty.value = true }, { deep: true })

const mandatoryCount = computed(() => matrix.value.classifications
  .flatMap(c => c.skills)
  .filter(s => s.priority === 'mandatory').length)

const totalSkills = computed(() => matrix.value.classifications.flatMap(c => c.skills).length)

function slug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 80) || crypto.randomUUID()
}

function addClassification() {
  if (matrix.value.classifications.length >= 5) return
  matrix.value.classifications.push({ id: `classification_${Date.now()}`, name: 'New Classification', skills: [] })
}

function removeClassification(index: number) {
  matrix.value.classifications.splice(index, 1)
}

function addSkill(classification: Classification) {
  if (classification.skills.length >= 8) return
  classification.skills.push({ id: `skill_${Date.now()}_${classification.skills.length}`, skill: '', priority: 'preferred', rationale: '' })
}

function removeSkill(classification: Classification, index: number) {
  classification.skills.splice(index, 1)
}

function normalizeIds() {
  matrix.value.classifications.forEach((c, ci) => {
    c.id = slug(c.name || `classification_${ci + 1}`)
    c.skills.forEach((s, si) => { s.id = `${c.id}_${slug(s.skill || `skill_${si + 1}`)}` })
  })
}

function validateMatrix(): string | null {
  if (matrix.value.classifications.length < 1 || matrix.value.classifications.length > 5) return 'Use between 1 and 5 classifications.'
  let mandatory = 0
  for (const c of matrix.value.classifications) {
    if (!c.name.trim()) return 'Every classification needs a name.'
    if (c.skills.length === 0) return `${c.name} needs at least one skill.`
    const mandatoryInClass = c.skills.filter(s => s.priority === 'mandatory').length
    if (mandatoryInClass > 3) return `${c.name} has more than 3 Mandatory skills.`
    mandatory += mandatoryInClass
    for (const s of c.skills) if (!s.skill.trim()) return `A skill under ${c.name} is blank.`
  }
  if (mandatory > 12) return 'Use no more than 12 Mandatory skills overall.'
  return null
}

async function generateMatrix() {
  if (!job.value?.description) {
    toast.warning('JD required', 'Add or paste the Job Description in Job Settings first.')
    return
  }
  isGenerating.value = true
  try {
    const result: any = await $fetch(`/api/jobs/${jobId}/skill-matrix/generate`, { method: 'POST' })
    matrix.value = result.matrix
    approved.value = false
    dirty.value = true
    toast.success('Skill Matrix generated', 'Review and edit it before approving.')
  } catch (err: any) {
    toast.error('Could not generate Skill Matrix', { message: err?.data?.statusMessage ?? err?.message })
  } finally {
    isGenerating.value = false
  }
}

async function persist(approve: boolean) {
  const validation = validateMatrix()
  if (validation) {
    toast.warning('Review Skill Matrix', validation)
    return
  }
  normalizeIds()
  isSaving.value = true
  try {
    await $fetch(`/api/jobs/${jobId}/skill-matrix`, {
      method: 'PUT',
      body: { matrix: matrix.value, approved: approve },
    })
    approved.value = approve
    dirty.value = false
    await refresh()
    toast.success(approve ? 'Skill Matrix approved' : 'Draft saved', approve ? 'This matrix is now the approved requirement baseline.' : 'Your edits have been saved.')
  } catch (err: any) {
    toast.error('Could not save Skill Matrix', { message: err?.data?.statusMessage ?? err?.message })
  } finally {
    isSaving.value = false
  }
}

useSeoMeta({ title: computed(() => job.value ? `Skill Matrix — ${job.value.title}` : 'Skill Matrix'), robots: 'noindex, nofollow' })
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <JobSubNavActions :job-id="jobId" />

    <div v-if="jobFetchStatus === 'pending' || matrixFetchStatus === 'pending'" class="py-12 text-center text-surface-400">Loading…</div>
    <div v-else-if="jobError" class="rounded-lg border border-danger-200 bg-danger-50 p-4 text-danger-700">Failed to load job.</div>

    <template v-else-if="job">
      <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div class="flex items-center gap-2">
            <h1 class="text-2xl font-bold text-surface-900 dark:text-surface-50">JD & Skill Matrix</h1>
            <span v-if="approved" class="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-1 text-xs font-medium text-success-700 ring-1 ring-success-200">
              <ShieldCheck class="size-3.5" /> Approved
            </span>
          </div>
          <p class="mt-1 text-sm text-surface-500">Generate the requirement baseline from the active JD, edit it, then approve before candidate evaluation.</p>
        </div>
        <NuxtLink :to="`/dashboard/jobs/${jobId}/settings`" class="text-sm font-medium text-brand-600 hover:underline">Edit JD in Job Settings</NuxtLink>
      </div>

      <section class="mb-6 rounded-xl border border-surface-200 bg-white p-5 dark:border-surface-800 dark:bg-surface-900">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p class="text-sm font-semibold text-surface-900 dark:text-surface-100">Active Requirement</p>
            <p class="mt-1 text-sm text-surface-500"><strong>{{ job.title }}</strong><span v-if="job.location"> · {{ job.location }}</span></p>
            <p class="mt-1 text-xs text-surface-400">{{ matrix.classifications.length }} classifications · {{ totalSkills }} skills · {{ mandatoryCount }} mandatory</p>
          </div>
          <button type="button" :disabled="isGenerating" class="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50" @click="generateMatrix">
            <Loader2 v-if="isGenerating" class="size-4 animate-spin" />
            <Sparkles v-else class="size-4" />
            {{ matrix.classifications.length ? 'Regenerate from JD' : 'Generate from JD' }}
          </button>
        </div>
      </section>

      <div v-if="matrix.classifications.length === 0" class="rounded-xl border-2 border-dashed border-surface-200 p-10 text-center dark:border-surface-800">
        <Sparkles class="mx-auto size-8 text-surface-400" />
        <h2 class="mt-3 font-semibold text-surface-900 dark:text-surface-100">No Skill Matrix yet</h2>
        <p class="mt-1 text-sm text-surface-500">Generate it from the JD. AI will create 4–5 major classifications with focused Mandatory, Preferred and Optional skills.</p>
      </div>

      <div v-else class="space-y-4">
        <section v-for="(classification, ci) in matrix.classifications" :key="classification.id" class="rounded-xl border border-surface-200 bg-white p-5 dark:border-surface-800 dark:bg-surface-900">
          <div class="mb-4 flex items-center gap-3">
            <input v-model="classification.name" class="min-w-0 flex-1 rounded-lg border border-surface-300 bg-white px-3 py-2 font-semibold text-surface-900 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-100" />
            <span class="text-xs text-surface-400">{{ classification.skills.filter(s => s.priority === 'mandatory').length }}/3 mandatory</span>
            <button type="button" class="rounded-lg p-2 text-danger-500 hover:bg-danger-50" @click="removeClassification(ci)"><Trash2 class="size-4" /></button>
          </div>

          <div class="space-y-3">
            <div v-for="(skill, si) in classification.skills" :key="skill.id" class="grid grid-cols-1 gap-2 rounded-lg bg-surface-50 p-3 dark:bg-surface-800/60 md:grid-cols-[1.4fr_160px_2fr_36px] md:items-center">
              <input v-model="skill.skill" placeholder="Skill / requirement" class="rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-900" />
              <select v-model="skill.priority" class="rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-900">
                <option value="mandatory">Mandatory</option>
                <option value="preferred">Preferred</option>
                <option value="optional">Optional</option>
              </select>
              <input v-model="skill.rationale" placeholder="Why this matters / evidence expected" class="rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-900" />
              <button type="button" class="rounded-lg p-2 text-surface-400 hover:bg-white hover:text-danger-500" @click="removeSkill(classification, si)"><Trash2 class="size-4" /></button>
            </div>
          </div>

          <button type="button" :disabled="classification.skills.length >= 8" class="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 disabled:opacity-40" @click="addSkill(classification)"><Plus class="size-4" /> Add skill</button>
        </section>

        <button v-if="matrix.classifications.length < 5" type="button" class="inline-flex items-center gap-1 rounded-lg border border-dashed border-surface-300 px-4 py-2 text-sm font-medium text-surface-600 hover:border-brand-400 hover:text-brand-600" @click="addClassification"><Plus class="size-4" /> Add classification</button>

        <div class="sticky bottom-4 flex flex-col gap-3 rounded-xl border border-surface-200 bg-white/95 p-4 shadow-lg backdrop-blur dark:border-surface-800 dark:bg-surface-900/95 sm:flex-row sm:items-center sm:justify-between">
          <p class="text-xs text-surface-500"><span v-if="dirty">Unsaved changes. </span>Approval locks this matrix as the baseline for candidate screening.</p>
          <div class="flex gap-2">
            <button type="button" :disabled="isSaving" class="inline-flex items-center gap-2 rounded-lg border border-surface-300 px-4 py-2 text-sm font-medium text-surface-700 disabled:opacity-50" @click="persist(false)"><Save class="size-4" /> Save Draft</button>
            <button type="button" :disabled="isSaving" class="inline-flex items-center gap-2 rounded-lg bg-success-600 px-4 py-2 text-sm font-medium text-white hover:bg-success-700 disabled:opacity-50" @click="persist(true)"><CheckCircle2 class="size-4" /> Approve Skill Matrix</button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
