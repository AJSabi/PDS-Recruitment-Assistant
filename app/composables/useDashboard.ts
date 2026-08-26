/**
 * PDS recruiter dashboard data.
 * Server-side visibility determines whether the current user sees all
 * requirements or only the requirements allocated to them.
 */
export function useDashboard() {
  const { data, status: fetchStatus, error, refresh } = useFetch('/api/dashboard/stats', {
    key: 'dashboard-stats',
    headers: useRequestHeaders(['cookie']),
  })

  const counts = computed(() => data.value?.counts ?? {
    openJobs: 0,
    totalCandidates: 0,
    totalApplications: 0,
    newApplications: 0,
  })

  const pipeline = computed(() => data.value?.pipeline ?? {
    new: 0,
    screening: 0,
    interview: 0,
    offer: 0,
    hired: 0,
    rejected: 0,
  })

  const jobsByStatus = computed(() => data.value?.jobsByStatus ?? {
    draft: 0,
    open: 0,
    closed: 0,
    archived: 0,
  })

  const recentApplications = computed(() => data.value?.recentApplications ?? [])
  const topJobs = computed(() => data.value?.topJobs ?? [])
  const recruitment = computed(() => data.value?.recruitment ?? {
    overdueRequirements: 0,
    dueSoonRequirements: 0,
    actionPending: 0,
  })
  const scope = computed(() => data.value?.scope ?? { role: 'member', allocatedOnly: true })

  return {
    counts,
    pipeline,
    jobsByStatus,
    recentApplications,
    topJobs,
    recruitment,
    scope,
    fetchStatus,
    error,
    refresh,
  }
}
