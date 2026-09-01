<script setup lang="ts">
import {
  BarChart3,
  Briefcase,
  ChevronDown,
  ChevronLeft,
  Database,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Plus,
  Settings,
  Sun,
  UserRound,
  UserRoundCog,
  X,
} from 'lucide-vue-next'

const route = useRoute()
const localePath = useLocalePath()
const { data: session } = await authClient.useSession(useFetch)
const { isDark, toggle: toggleColorMode } = useColorMode()
const isSigningOut = ref(false)
const showUserMenu = ref(false)
const showMobileMenu = ref(false)

const { data: recruitmentScope } = useFetch('/api/recruitment-scope', {
  key: 'pds-recruitment-scope',
  headers: useRequestHeaders(['cookie']),
})
const canManageRequirements = computed(() => Boolean(recruitmentScope.value?.canManageRequirements))

const userName = computed(() => session.value?.user?.name ?? 'User')
const userEmail = computed(() => session.value?.user?.email ?? '')
const userInitials = computed(() => {
  const parts = userName.value.split(' ').filter(Boolean)
  if (parts.length >= 2) return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase()
  return userName.value.slice(0, 2).toUpperCase()
})

async function handleSignOut() {
  isSigningOut.value = true
  await authClient.signOut()
  clearNuxtData()
  await navigateTo(localePath('/auth/sign-in'))
}

const mainNav = computed(() => [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, exact: true },
  { label: 'Requirements', to: '/dashboard/jobs', icon: Briefcase, exact: false },
  { label: 'Candidate Database', to: '/dashboard/pds-candidates', icon: Database, exact: false },
  ...(canManageRequirements.value ? [
    { label: 'Analytics', to: '/dashboard/management-analytics', icon: BarChart3, exact: true },
    { label: 'Allocations', to: '/dashboard/requirement-allocations', icon: UserRoundCog, exact: true },
  ] : []),
  canManageRequirements.value
    ? { label: 'Settings', to: '/dashboard/settings', icon: Settings, exact: false }
    : { label: 'My Account', to: '/dashboard/settings/account', icon: UserRound, exact: true },
])

function isActiveRoute(to: string, exact = false) {
  const localized = localePath(to)
  return exact ? route.path === localized : route.path === localized || route.path.startsWith(`${localized}/`)
}

const activeJobId = computed(() => {
  const idParam = route.params.id
  if (typeof idParam !== 'string' || !idParam || idParam === 'new') return null
  const jobsBase = localePath('/dashboard/jobs')
  return route.path.startsWith(`${jobsBase}/`) ? idParam : null
})

const { data: jobsData, refresh: refreshTopbarJobs } = useFetch('/api/jobs', {
  key: 'pds-topbar-jobs',
  query: { limit: 100 },
  headers: useRequestHeaders(['cookie']),
})

const activeJob = computed<any>(() => {
  if (!activeJobId.value) return null
  return (jobsData.value?.data ?? []).find((item: any) => item.id === activeJobId.value) ?? null
})

watch(activeJobId, async (jobId) => {
  if (jobId && !activeJob.value) await refreshTopbarJobs()
}, { immediate: true })

const jobTabs = computed(() => {
  if (!activeJobId.value) return []
  const base = `/dashboard/jobs/${activeJobId.value}`
  return [
    { id: 'pipeline', label: 'Pipeline', to: base },
    { id: 'jd-skill-matrix', label: 'JD & Skill Matrix', to: `${base}/ai-analysis` },
    { id: 'ai-candidate-pool', label: 'AI Candidate Pool', to: `${base}/pds-ranking` },
    { id: 'candidate-register', label: 'Candidate Register', to: `${base}/pds-register` },
    { id: 'requirement-settings', label: 'Settings', to: `${base}/settings` },
  ]
})

watch(() => route.path, () => {
  showUserMenu.value = false
  showMobileMenu.value = false
})
</script>

<template>
  <header class="sticky top-0 z-50 w-full">
    <div class="border-b border-[#D9E6EF] bg-white/95 backdrop-blur dark:border-surface-800 dark:bg-surface-900/95">
      <div class="flex h-16 items-center justify-between gap-3 px-4 lg:px-6">
        <div class="flex min-w-0 items-center gap-3">
          <NuxtLink :to="localePath('/dashboard')" class="flex shrink-0 items-center gap-2.5 no-underline">
            <img src="/eagle-mascot-logo.png" alt="PDS Recruitment Assistant" class="size-9 object-contain" />
            <span class="hidden text-[15px] font-bold leading-tight text-[#102A43] dark:text-surface-100 sm:block">PDS Recruitment<br />Assistant</span>
          </NuxtLink>
          <nav class="hidden items-center gap-1 md:flex">
            <NuxtLink v-for="item in mainNav" :key="item.to" :to="localePath(item.to)" class="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium no-underline transition-colors" :class="isActiveRoute(item.to, item.exact) ? 'bg-[#EAF4FB] text-[#1F6FA3] dark:bg-brand-950/40 dark:text-brand-300' : 'text-surface-600 hover:bg-[#F3F8FB] hover:text-[#102A43] dark:text-surface-400 dark:hover:bg-surface-800 dark:hover:text-surface-100'"><component :is="item.icon" class="size-4" />{{ item.label }}</NuxtLink>
          </nav>
        </div>

        <div class="flex shrink-0 items-center gap-2">
          <NuxtLink v-if="canManageRequirements" :to="localePath('/dashboard/jobs/new')" class="inline-flex items-center gap-1.5 rounded-lg bg-[#2E86C1] px-4 py-2 text-sm font-semibold text-white no-underline shadow-sm hover:bg-[#2677AD]"><Plus class="size-4" /><span class="hidden sm:inline">New Requirement</span></NuxtLink>
          <div class="hidden lg:block"><LanguageSwitcher /></div>
          <button type="button" class="inline-flex size-9 items-center justify-center rounded-lg text-surface-500 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-800" :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'" @click="toggleColorMode"><Sun v-if="isDark" class="size-4" /><Moon v-else class="size-4" /></button>
          <div class="relative">
            <button type="button" class="flex items-center gap-1.5 rounded-lg px-1.5 py-1 hover:bg-surface-100 dark:hover:bg-surface-800" @click="showUserMenu = !showUserMenu"><span class="flex size-8 items-center justify-center rounded-full bg-[#102A43] text-xs font-bold text-white">{{ userInitials }}</span><ChevronDown class="size-3 text-surface-400" /></button>
            <div v-if="showUserMenu" class="absolute right-0 top-[calc(100%+6px)] w-64 overflow-hidden rounded-xl border border-surface-200 bg-white shadow-xl dark:border-surface-700 dark:bg-surface-900"><div class="border-b border-surface-100 px-4 py-3 dark:border-surface-800"><p class="text-sm font-semibold text-surface-900 dark:text-surface-100">{{ userName }}</p><p class="truncate text-xs text-surface-500">{{ userEmail }}</p></div><NuxtLink :to="localePath('/dashboard/settings/account')" class="flex items-center gap-2 px-4 py-2.5 text-sm text-surface-600 no-underline hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-800"><UserRound class="size-4" />My Account</NuxtLink><div class="p-1 lg:hidden"><LanguageSwitcher /></div><button type="button" :disabled="isSigningOut" class="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-surface-600 hover:bg-surface-100 disabled:opacity-50 dark:text-surface-400 dark:hover:bg-surface-800" @click="handleSignOut"><LogOut class="size-4" />{{ isSigningOut ? 'Signing out…' : 'Sign out' }}</button></div>
          </div>
          <button type="button" class="inline-flex size-9 items-center justify-center rounded-lg text-surface-500 hover:bg-surface-100 md:hidden dark:text-surface-400 dark:hover:bg-surface-800" @click="showMobileMenu = !showMobileMenu"><X v-if="showMobileMenu" class="size-5" /><Menu v-else class="size-5" /></button>
        </div>
      </div>
      <nav v-if="showMobileMenu" class="border-t border-surface-100 px-4 py-3 md:hidden dark:border-surface-800"><NuxtLink v-for="item in mainNav" :key="item.to" :to="localePath(item.to)" class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-surface-600 no-underline hover:bg-[#F3F8FB] dark:text-surface-400 dark:hover:bg-surface-800"><component :is="item.icon" class="size-4" />{{ item.label }}</NuxtLink></nav>
    </div>

    <div v-if="activeJobId" class="border-b border-[#D9E6EF] bg-[#F7FBFE]/95 dark:border-surface-800 dark:bg-surface-950/95">
      <div class="flex h-11 items-center gap-3 overflow-x-auto px-4 lg:px-6">
        <a :href="localePath('/dashboard/jobs')" data-testid="requirement-tab-all" class="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-surface-500 no-underline hover:text-[#102A43] dark:text-surface-400 dark:hover:text-surface-100"><ChevronLeft class="size-3.5" />All Requirements</a>
        <span class="hidden max-w-52 truncate text-sm font-semibold text-[#102A43] sm:inline dark:text-surface-100">{{ activeJob?.title ?? 'Requirement' }}</span>
        <nav class="flex items-center gap-1" data-testid="requirement-tab-ribbon">
          <a v-for="tab in jobTabs" :key="tab.to" :href="localePath(tab.to)" :data-testid="`requirement-tab-${tab.id}`" class="whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium no-underline" :class="isActiveRoute(tab.to, true) ? 'bg-white text-[#102A43] shadow-sm dark:bg-surface-800 dark:text-surface-100' : 'text-surface-500 hover:text-[#1F6FA3] dark:text-surface-400 dark:hover:text-surface-100'">{{ tab.label }}</a>
        </nav>
        <div id="job-sub-nav-actions" class="ml-auto flex items-center gap-2" />
      </div>
    </div>
  </header>
</template>