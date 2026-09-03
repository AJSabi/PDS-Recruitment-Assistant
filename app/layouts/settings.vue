<script setup lang="ts">
const route = useRoute()
const localePath = useLocalePath()
const { data: recruitmentScope } = await useFetch('/api/recruitment-scope', {
  key: 'pds-settings-scope',
  headers: useRequestHeaders(['cookie']),
})

const canManageSettings = computed(() => Boolean(recruitmentScope.value?.canManageRequirements))
const accountPath = computed(() => localePath('/dashboard/settings/account'))

if (!canManageSettings.value && route.path !== accountPath.value) {
  await navigateTo(accountPath.value)
}
</script>

<template>
  <div class="flex min-h-screen flex-col bg-[#F6FAFD] dark:bg-surface-950">
    <AppTopBar class="hidden lg:block" />
    <AppToasts />

    <div class="flex flex-1 flex-col lg:flex-row min-w-0">
      <div v-if="canManageSettings" class="hidden lg:block sticky top-14 h-[calc(100vh-3.5rem)] shrink-0 z-10">
        <SettingsSidebar />
      </div>
      <div v-if="canManageSettings" class="lg:hidden sticky top-0 z-10">
        <SettingsMobileNav />
      </div>
      <main class="flex-1 min-w-0 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        <slot />
      </main>
    </div>
  </div>
</template>
