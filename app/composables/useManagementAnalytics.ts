export function useManagementAnalytics() {
  const nuxtApp = useNuxtApp()
  const { data, status, error, refresh: refreshData } = useFetch('/api/dashboard/management', {
    key: 'pds-management-analytics',
    headers: useRequestHeaders(['cookie']),
    getCachedData: key => nuxtApp.payload.data[key] ?? nuxtApp.static.data[key],
  })

  if (import.meta.client) {
    onMounted(() => { void refreshData() })
  }

  const summary = computed(() => data.value?.summary ?? {
    openRequirements: 0,
    unallocatedRequirements: 0,
    activeCandidates: 0,
    profilesSourced: 0,
    screensCompleted: 0,
    overdueRequirements: 0,
    dueSoonRequirements: 0,
    averageOpenDays: 0,
  })
  const ageing = computed(() => data.value?.ageing ?? {
    days0To30: 0,
    days31To45: 0,
    days46To60: 0,
    days61Plus: 0,
    tatNotStarted: 0,
  })
  const stageFunnel = computed(() => data.value?.stageFunnel ?? [])
  const historicalConversions = computed(() => data.value?.historicalConversions ?? {
    telemetryStartAt: '',
    observedApplications: 0,
    metrics: [],
  })
  const recruiters = computed(() => data.value?.recruiters ?? [])
  const requirements = computed(() => data.value?.requirements ?? [])
  const limitations = computed(() => data.value?.limitations ?? {
    sourceEffectiveness: '',
    historicalConversion: '',
  })
  const refresh = () => refreshData()

  return {
    data,
    summary,
    ageing,
    stageFunnel,
    historicalConversions,
    recruiters,
    requirements,
    limitations,
    status,
    error,
    refresh,
  }
}
