<script setup lang="ts">
const route = useRoute()
const isFullbleed = computed(() => !!route.meta.fullbleed)
</script>

<template>
  <div class="flex h-screen flex-col overflow-hidden bg-[#F6FAFD] dark:bg-surface-950">
    <AppTopBar />
    <AppToasts />
    <main
      :class="[
        'relative flex-1 min-h-0',
        isFullbleed
          ? 'flex flex-col overflow-hidden'
          : 'overflow-y-auto px-4 py-6 sm:px-6 lg:px-8 lg:py-8',
      ]"
    >
      <div :class="isFullbleed ? 'min-h-0 flex-1 overflow-hidden' : 'contents'">
        <slot />
      </div>
    </main>
  </div>
</template>
