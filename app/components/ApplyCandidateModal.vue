<script setup lang="ts">
import { Search, X, UserPlus, UserRoundPlus, Loader2 } from 'lucide-vue-next'
import { usePreviewReadOnly } from '~/composables/usePreviewReadOnly'

const props = withDefaults(defineProps<{
  jobId: string
  teleportTarget?: string | HTMLElement
}>(), {
  teleportTarget: 'body',
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'created', payload?: { applicationId?: string; created?: boolean }): void
}>()

const mode = ref<'existing' | 'new'>('new')
const searchInput = ref('')
const debouncedSearch = ref<string | undefined>(undefined)
let debounceTimer: ReturnType<typeof setTimeout>

watch(searchInput, (val) => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debouncedSearch.value = val.trim() || undefined
  }, 300)
})

const { data: candidateData, status: searchStatus } = useFetch('/api/candidates', {
  key: `apply-candidate-search-${props.jobId}`,
  query: computed(() => ({
    ...(debouncedSearch.value && { search: debouncedSearch.value }),
    limit: 20,
  })),
  headers: useRequestHeaders(['cookie']),
})

const candidates = computed(() => candidateData.value?.data ?? [])
const { handlePreviewReadOnlyError } = usePreviewReadOnly()
const { formatCandidateName } = useOrgSettings()

const isApplying = ref(false)
const applyError = ref('')
const newCandidate = reactive({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  notes: '',
})

function resetError() { applyError.value = '' }

async function attachCandidate(body: Record<string, unknown>) {
  isApplying.value = true
  applyError.value = ''
  try {
    const result: any = await $fetch(`/api/jobs/${props.jobId}/candidate-intake`, {
      method: 'POST',
      body,
    })
    emit('created', { applicationId: result.applicationId, created: result.created })
  } catch (err: any) {
    if (handlePreviewReadOnlyError(err)) return
    applyError.value = err?.data?.statusMessage ?? err?.message ?? 'Failed to add candidate to this requirement.'
  } finally {
    isApplying.value = false
  }
}

async function applyExistingCandidate(candidateId: string) {
  await attachCandidate({ candidateId })
}

async function createCandidate() {
  const firstName = newCandidate.firstName.trim()
  const lastName = newCandidate.lastName.trim()
  const email = newCandidate.email.trim()
  if (!firstName || !lastName || !email) {
    applyError.value = 'First name, last name and email are required.'
    return
  }
  await attachCandidate({
    firstName,
    lastName,
    email,
    phone: newCandidate.phone.trim() || undefined,
    notes: newCandidate.notes.trim() || undefined,
  })
}
</script>

<template>
  <Teleport :to="teleportTarget">
    <div class="fixed inset-0 z-[250] flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="emit('close')" />
      <div class="relative mx-4 flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-surface-900">
        <div class="flex items-center justify-between border-b border-surface-200 px-5 py-4 dark:border-surface-800">
          <div class="flex items-center gap-2">
            <UserPlus class="size-5 text-brand-600 dark:text-brand-400" />
            <div>
              <h3 class="text-lg font-semibold text-surface-900 dark:text-surface-50">Add Candidate to Requirement</h3>
              <p class="mt-0.5 text-xs text-surface-500">Create a new candidate here or attach someone already in the Candidate Database.</p>
            </div>
          </div>
          <button type="button" class="text-surface-400 transition-colors hover:text-surface-600 dark:hover:text-surface-200" @click="emit('close')">
            <X class="size-5" />
          </button>
        </div>

        <div class="border-b border-surface-200 px-5 pt-4 dark:border-surface-800">
          <div class="flex gap-1 rounded-xl bg-surface-100 p-1 dark:bg-surface-800">
            <button
              type="button"
              class="flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition"
              :class="mode === 'new' ? 'bg-white text-[#102A43] shadow-sm dark:bg-surface-900 dark:text-white' : 'text-surface-500'"
              @click="mode = 'new'; resetError()"
            >
              New Candidate
            </button>
            <button
              type="button"
              class="flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition"
              :class="mode === 'existing' ? 'bg-white text-[#102A43] shadow-sm dark:bg-surface-900 dark:text-white' : 'text-surface-500'"
              @click="mode = 'existing'; resetError()"
            >
              Existing Candidate
            </button>
          </div>
        </div>

        <div v-if="applyError" class="mx-5 mt-4 rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700 dark:bg-danger-950 dark:text-danger-400">
          {{ applyError }}
        </div>

        <div v-if="mode === 'new'" class="overflow-y-auto px-5 py-5">
          <div class="mb-4 flex items-start gap-3 rounded-xl border border-[#CFE0ED] bg-[#F7FBFE] p-4 dark:border-surface-700 dark:bg-surface-800/40">
            <UserRoundPlus class="mt-0.5 size-5 shrink-0 text-[#2E86C1]" />
            <div>
              <p class="text-sm font-semibold text-[#102A43] dark:text-white">Create directly in this requirement</p>
              <p class="mt-1 text-xs leading-5 text-surface-500">The candidate is created in the central Candidate Database and linked to this job immediately. Duplicate email records are reused rather than recreated.</p>
            </div>
          </div>

          <form class="space-y-4" @submit.prevent="createCandidate">
            <div class="grid gap-4 sm:grid-cols-2">
              <label class="text-sm font-medium text-surface-700 dark:text-surface-300">First name <span class="text-danger-500">*</span>
                <input v-model="newCandidate.firstName" :disabled="isApplying" autocomplete="given-name" class="mt-1.5 w-full rounded-lg border border-surface-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-surface-700 dark:bg-surface-800" />
              </label>
              <label class="text-sm font-medium text-surface-700 dark:text-surface-300">Last name <span class="text-danger-500">*</span>
                <input v-model="newCandidate.lastName" :disabled="isApplying" autocomplete="family-name" class="mt-1.5 w-full rounded-lg border border-surface-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-surface-700 dark:bg-surface-800" />
              </label>
            </div>
            <label class="block text-sm font-medium text-surface-700 dark:text-surface-300">Email <span class="text-danger-500">*</span>
              <input v-model="newCandidate.email" :disabled="isApplying" type="email" autocomplete="email" class="mt-1.5 w-full rounded-lg border border-surface-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-surface-700 dark:bg-surface-800" />
            </label>
            <label class="block text-sm font-medium text-surface-700 dark:text-surface-300">Phone
              <input v-model="newCandidate.phone" :disabled="isApplying" type="tel" autocomplete="tel" class="mt-1.5 w-full rounded-lg border border-surface-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-surface-700 dark:bg-surface-800" />
            </label>
            <label class="block text-sm font-medium text-surface-700 dark:text-surface-300">Recruiter note <span class="font-normal text-surface-400">(optional)</span>
              <textarea v-model="newCandidate.notes" :disabled="isApplying" rows="3" placeholder="Source, referral context or initial note" class="mt-1.5 w-full rounded-lg border border-surface-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-surface-700 dark:bg-surface-800" />
            </label>

            <div class="flex justify-end gap-2 border-t border-surface-100 pt-4 dark:border-surface-800">
              <button type="button" :disabled="isApplying" class="rounded-lg border border-surface-300 px-4 py-2 text-sm font-medium dark:border-surface-700" @click="emit('close')">Cancel</button>
              <button type="submit" :disabled="isApplying" class="inline-flex items-center gap-2 rounded-lg bg-[#16847F] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                <Loader2 v-if="isApplying" class="size-4 animate-spin" /><UserPlus v-else class="size-4" />{{ isApplying ? 'Adding…' : 'Add to Requirement' }}
              </button>
            </div>
          </form>
        </div>

        <template v-else>
          <div class="px-5 pt-4">
            <div class="relative">
              <Search class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-surface-400" />
              <input
                v-model="searchInput"
                type="text"
                placeholder="Search Candidate Database by name or email…"
                class="w-full rounded-lg border border-surface-200 bg-white py-2.5 pl-10 pr-3 text-sm text-surface-900 placeholder:text-surface-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-100"
              />
            </div>
          </div>

          <div class="flex-1 overflow-y-auto px-5 py-3">
            <div v-if="searchStatus === 'pending'" class="py-8 text-center text-sm text-surface-400">Searching…</div>
            <div v-else-if="candidates.length === 0" class="py-8 text-center text-sm text-surface-400">{{ debouncedSearch ? 'No candidates found.' : 'No candidates in your organisation yet.' }}</div>
            <div v-else class="space-y-1">
              <button
                v-for="c in candidates"
                :key="c.id"
                :disabled="isApplying"
                type="button"
                class="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left transition-colors hover:bg-surface-50 disabled:opacity-50 dark:hover:bg-surface-800"
                @click="applyExistingCandidate(c.id)"
              >
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium text-surface-900 dark:text-surface-100">{{ formatCandidateName(c) }}</p>
                  <p class="truncate text-xs text-surface-400">{{ c.email }}</p>
                </div>
                <span class="ml-2 shrink-0 text-xs font-semibold text-brand-600 dark:text-brand-400">Add to Job</span>
              </button>
            </div>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>
