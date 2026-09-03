export function useManagementAnalytics() {
  const nuxtApp = useNuxtApp()
  const { data, status, error, refresh: refreshData } = useFetch('/api/dashboard/management', {
    key: 'pds-management-analytics',
    headers: useRequestHeaders(['cookie']),
    getCachedData: key => nuxtApp.payload.data[key] ?? nuxtApp.static.data[key],
  })
  const { data: taLeadData, status: taLeadStatus, error: taLeadError, refresh: refreshTaLead } = useFetch('/api/dashboard/ta-lead-kpis', {
    key: 'pds-ta-lead-kpis',
    headers: useRequestHeaders(['cookie']),
    getCachedData: key => nuxtApp.payload.data[key] ?? nuxtApp.static.data[key],
  })

  if (import.meta.client) {
    onMounted(() => {
      void refreshData()
      void refreshTaLead()
    })
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
  const sourceEffectiveness = computed(() => data.value?.sourceEffectiveness ?? {
    telemetryStartAt: '',
    attributedApplications: 0,
    rows: [],
  })
  const recruiters = computed(() => data.value?.recruiters ?? [])
  const requirements = computed(() => data.value?.requirements ?? [])
  const limitations = computed(() => data.value?.limitations ?? {
    sourceEffectiveness: '',
    historicalConversion: '',
  })
  const taLead = computed(() => taLeadData.value ?? {
    date: '',
    averageWindow: { days: 30, startDate: '', endDate: '' },
    team: { daily: {}, average: {}, windowTotals: {} },
    recruiters: [],
    attributionNote: '',
    scopeNote: '',
  })
  const refresh = () => Promise.all([refreshData(), refreshTaLead()])

  return {
    data,
    summary,
    ageing,
    stageFunnel,
    historicalConversions,
    sourceEffectiveness,
    recruiters,
    requirements,
    limitations,
    taLead,
    taLeadStatus,
    taLeadError,
    status,
    error,
    refresh,
  }
}
