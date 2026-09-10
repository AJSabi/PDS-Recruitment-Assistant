type RecruiterPerformancePeriod = 7 | 30 | 90

export function useRecruiterPerformance() {
  const period = ref<RecruiterPerformancePeriod>(30)
  const recruiterId = useState<string | null>('dashboard-recruiter-filter', () => null)

  const query = computed(() => ({
    period: period.value,
    ...(recruiterId.value ? { recruiterId: recruiterId.value } : {}),
  }))

  const { data, status, error, refresh } = useFetch('/api/dashboard/recruiter-performance', {
    key: 'recruiter-performance',
    headers: useRequestHeaders(['cookie']),
    query,
    watch: [period, recruiterId],
  })

  const recruiters = computed(() => (data.value?.recruiters ?? []).map(recruiter => ({
    id: recruiter.recruiterId,
    name: recruiter.recruiterName,
  })))

  const scope = computed(() => {
    const responseScope = data.value?.scope
    const selectedRecruiterName = recruiterId.value
      ? recruiters.value.find(recruiter => recruiter.id === recruiterId.value)?.name ?? 'Recruiter'
      : responseScope?.mode === 'self' ? 'My Performance' : 'All Recruiters'

    return {
      canSelectRecruiter: responseScope?.mode === 'team' || responseScope?.mode === 'recruiter',
      selectedRecruiterId: responseScope?.recruiterId ?? null,
      selectedRecruiterName,
    }
  })

  const totals = computed(() => data.value?.totals ?? {
    candidatesSourced: 0,
    recruiterScreeningsCompleted: 0,
    interviewsCompleted: 0,
    offersRaised: 0,
    offersAccepted: 0,
    joined: 0,
  })

  const conversions = computed(() => data.value?.conversions ?? {
    screeningToInterview: 0,
    interviewToOffer: 0,
    offerToAcceptance: 0,
    offerToJoin: 0,
  })

  const trend = computed(() => data.value?.series ?? [])

  function setPeriod(value: RecruiterPerformancePeriod) {
    period.value = value
  }

  function setRecruiter(value: string | null) {
    recruiterId.value = value
  }

  return {
    period,
    recruiterId,
    scope,
    totals,
    conversions,
    trend,
    recruiters,
    status,
    error,
    refresh,
    setPeriod,
    setRecruiter,
  }
}
