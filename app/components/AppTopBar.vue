<script setup lang="ts">
import {
  Briefcase,
  Calendar,
  ChevronDown,
  ChevronLeft,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  MoreHorizontal,
  Plus,
  Settings,
  Sparkles,
  Sun,
  Users,
  X,
} from 'lucide-vue-next'

const route = useRoute()
const localePath = useLocalePath()
const getRouteBaseName = useRouteBaseName()
const { data: session } = await authClient.useSession(useFetch)
const { isDark, toggle: toggleColorMode } = useColorMode()
const isSigningOut = ref(false)
const showUserMenu = ref(false)
const showMobileMenu = ref(false)
const showMoreNav = ref(false)

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

const mainNav = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, exact: true },
  { label: 'Jobs', to: '/dashboard/jobs', icon: Briefcase, exact: false },
  { label: 'Candidates', to: '/dashboard/candidates', icon: Users, exact: false },
  { label: 'Applications', to: '/dashboard/applications', icon: FileText, exact: false },
  { label: 'Interviews', to: '/dashboard/interviews', icon: Calendar, exact: false },
]

const moreNav = [
  { label: 'AI Analysis', to: '/dashboard/ai-analysis', icon: Sparkles, exact: true },
  { label: 'Settings', to: '/dashboard/settings', icon: Settings, exact: false },
]

function isActiveRoute(to: string, exact = false) {
  const localized = localePath(to)
  return exact ? route.path === localized : route.path === localized || route.path.startsWith(`${localized}/`)
}

const activeJobId = computed(() => {
  const baseName = getRouteBaseName(route)
  if (typeof baseName !== 'string' || !baseName.startsWith('dashboard-jobs-id')) return null
  const idParam = route.params.id
  if (typeof idParam !== 'string' || idParam === 'new') return null
  return idParam
})

const { data: jobsData } = useFetch('/api/jobs', {
  key: 'pds-topbar-jobs',
  query: { limit: 100 },
  headers: useRequestHeaders(['cookie']),
})

const activeJob = computed<any>(() => {
  if (!activeJobId.value) return null
  return (jobsData.value?.data ?? []).find((item: any) => item.id === activeJobId.value) ?? null
})

const jobTabs = computed(() => {
  if (!activeJobId.value) return []
  const base = `/dashboard/jobs/${activeJobId.value}`
  return [
    { label: 'Pipeline', to: base },
    { label: 'Candidates', to: `${base}/candidates` },
    { label: 'JD & Skill Matrix', to: `${base}/ai-analysis` },
    { label: 'Settings', to: `${base}/settings` },
  ]
})

watch(() => route.path, () => {
  showUserMenu.value = false
  showMobileMenu.value = false
  showMoreNav.value = false
})
</script>

<template>
  <header class="sticky top-0 z-50 w-full">
    <div class="border-b border-surface-200 bg-white/95 backdrop-blur dark:border-surface-800 dark:bg-surface-900/95">
      <div class="flex h-16 items-center justify-between gap-3 px-4 lg:px-6">
        <div class="flex min-w-0 items-center gap-3">
          <NuxtLink :to="localePath('/dashboard')" class="flex shrink-0 items-center gap-2.5 no-underline">
            <img src="/eagle-mascot-logo.png" alt="PDS Recruitment Assistant" class="size-9 object-contain" />
            <span class="hidden text-[15px] font-bold leading-tight text-surface-900 dark:text-surface-100 sm:block">
              PDS Recruitment<br />Assistant
            </span>
          </NuxtLink>

          <nav class="hidden items-center gap-1 md:flex">
            <NuxtLink
              v-for="item in mainNav"
              :key="item.to"
              :to="localePath(item.to)"
              class="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium no-underline transition-colors"
              :class="isActiveRoute(item.to, item.exact)
                ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300'
                : 'text-surface-600 hover:bg-surface-100 hover:text-surface-900 dark:text-surface-400 dark:hover:bg-surface-800 dark:hover:text-surface-100'"
            >
              <component :is="item.icon" class="size-4" />
              {{ item.label }}
            </NuxtLink>

            <div class="relative">
              <button
                type="button"
                class="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-800"
                @click="showMoreNav = !showMoreNav"
              >
                <MoreHorizontal class="size-4" />
                More
                <ChevronDown class="size-3" />
              </button>
              <div v-if="showMoreNav" class="absolute left-0 top-[calc(100%+6px)] w-52 overflow-hidden rounded-xl border border-surface-200 bg-white py-1 shadow-xl dark:border-surface-700 dark:bg-surface-900">
                <NuxtLink
                  v-for="item in moreNav"
                  :key="item.to"
                  :to="localePath(item.to)"
                  class="flex items-center gap-2.5 px-3 py-2 text-sm text-surface-600 no-underline hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-800"
                >
                  <component :is="item.icon" class="size-4" />
                  {{ item.label }}
                </NuxtLink>
              </div>
            </div>
          </nav>
        </div>

        <div class="flex shrink-0 items-center gap-2">
          <NuxtLink
            :to="localePath('/dashboard/jobs/new')"
            class="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white no-underline shadow-sm hover:bg-brand-700"
          >
            <Plus class="size-4" />
            <span class="hidden sm:inline">New Job</span>
          </NuxtLink>

          <div class="hidden lg:block"><OrgSwitcher /></div>
          <div class="hidden lg:block"><LanguageSwitcher /></div>

          <button
            type="button"
            class="inline-flex size-9 items-center justify-center rounded-lg text-surface-500 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-800"
            :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
            @click="toggleColorMode"
          >
            <Sun v-if="isDark" class="size-4" />
            <Moon v-else class="size-4" />
          </button>

          <div class="relative">
            <button type="button" class="flex items-center gap-1.5 rounded-lg px-1.5 py-1 hover:bg-surface-100 dark:hover:bg-surface-800" @click="showUserMenu = !showUserMenu">
              <span class="flex size-8 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{{ userInitials }}</span>
              <ChevronDown class="size-3 text-surface-400" />
            </button>
            <div v-if="showUserMenu" class="absolute right-0 top-[calc(100%+6px)] w-64 overflow-hidden rounded-xl border border-surface-200 bg-white shadow-xl dark:border-surface-700 dark:bg-surface-900">
              <div class="border-b border-surface-100 px-4 py-3 dark:border-surface-800">
                <p class="text-sm font-semibold text-surface-900 dark:text-surface-100">{{ userName }}</p>
                <p class="truncate text-xs text-surface-500">{{ userEmail }}</p>
              </div>
              <div class="p-1 lg:hidden">
                <OrgSwitcher />
                <LanguageSwitcher />
              </div>
              <button type="button" :disabled="isSigningOut" class="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-surface-600 hover:bg-surface-100 disabled:opacity-50 dark:text-surface-400 dark:hover:bg-surface-800" @click="handleSignOut">
                <LogOut class="size-4" />
                {{ isSigningOut ? 'Signing out…' : 'Sign out' }}
              </button>
            </div>
          </div>

          <button type="button" class="inline-flex size-9 items-center justify-center rounded-lg text-surface-500 hover:bg-surface-100 md:hidden dark:text-surface-400 dark:hover:bg-surface-800" @click="showMobileMenu = !showMobileMenu">
            <X v-if="showMobileMenu" class="size-5" />
            <Menu v-else class="size-5" />
          </button>
        </div>
      </div>

      <nav v-if="showMobileMenu" class="border-t border-surface-100 px-4 py-3 md:hidden dark:border-surface-800">
        <NuxtLink
          v-for="item in [...mainNav, ...moreNav]"
          :key="item.to"
          :to="localePath(item.to)"
          class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-surface-600 no-underline hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-800"
        >
          <component :is="item.icon" class="size-4" />
          {{ item.label }}
        </NuxtLink>
      </nav>
    </div>

    <div v-if="activeJobId" class="border-b border-surface-200 bg-surface-50/95 dark:border-surface-800 dark:bg-surface-950/95">
      <div class="flex h-11 items-center gap-3 overflow-x-auto px-4 lg:px-6">
        <NuxtLink :to="localePath('/dashboard/jobs')" class="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-surface-500 no-underline hover:text-surface-800 dark:text-surface-400 dark:hover:text-surface-100">
          <ChevronLeft class="size-3.5" />
          All Jobs
        </NuxtLink>
        <span class="hidden max-w-52 truncate text-sm font-semibold text-surface-900 sm:inline dark:text-surface-100">{{ activeJob?.title ?? 'Requirement' }}</span>
        <nav class="flex items-center gap-1">
          <NuxtLink
            v-for="tab in jobTabs"
            :key="tab.to"
            :to="localePath(tab.to)"
            class="whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium no-underline"
            :class="isActiveRoute(tab.to, true)
              ? 'bg-white text-surface-900 shadow-sm dark:bg-surface-800 dark:text-surface-100'
              : 'text-surface-500 hover:text-surface-800 dark:text-surface-400 dark:hover:text-surface-100'"
          >
            {{ tab.label }}
          </NuxtLink>
        </nav>
        <div id="job-sub-nav-actions" class="ml-auto flex items-center gap-2" />
      </div>
    </div>
  </header>
</template>
