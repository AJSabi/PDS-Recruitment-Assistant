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

  const scope = computed(() => data.value?.scope ?? {
    canSelectRecruiter: false,
    selectedRecruiterId: null,
    selectedRecruiterName: 'My Performance',
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

  const trend = computed(() => data.value?.trend ?? [])
  const recruiters = computed(() => data.value?.recruiters ?? [])

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
