/**
 * Composable for fetching and updating organization localization settings.
 * Provides reactive settings and utilities for formatting candidate names/dates.
 */
export function useOrgSettings() {
  const { data, status, refresh } = useFetch('/api/org-settings', {
    key: 'org-settings',
    headers: useRequestHeaders(['cookie']),
  })

  const nameDisplayFormat = computed(() => data.value?.nameDisplayFormat ?? 'first_last')
  const dateFormat = computed(() => data.value?.dateFormat ?? 'mdy')

  /**
   * Format a candidate's full name according to the org's display preference.
   * Falls back to "First Last" if displayName is not set.
   */
  function formatCandidateName(candidate: {
    firstName?: string | null
    lastName?: string | null
    displayName?: string | null
  }): string {
    if (candidate.displayName?.trim()) return candidate.displayName.trim()
    return formatPersonName(candidate.firstName, candidate.lastName)
  }

  /**
   * Format a person's name from first/last parts according to the org's
   * display preference. Use for shapes that don't carry a `displayName`
   * (e.g. flattened API rows like `candidateFirstName` / `candidateLastName`).
   */
  function formatPersonName(
    firstName: string | null | undefined,
    lastName: string | null | undefined,
    displayName?: string | null
  ): string {
    if (displayName?.trim()) return displayName.trim()
    const first = (firstName ?? '').trim()
    const last = (lastName ?? '').trim()
    if (!first && !last) return ''
    if (!first) return last
    if (!last) return first
    if (nameDisplayFormat.value === 'last_first') {
      return `${last} ${first}`
    }
    return `${first} ${last}`
  }

  function localDateInput(value: string | Date): string | null {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) return null
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  /**
   * Format a timestamp or Date as an organization-formatted local date.
   * Returns an empty string for null/undefined values.
   */
  function formatDateTime(value: string | Date | null | undefined): string {
    if (!value) return ''
    const dateInput = localDateInput(value)
    return dateInput ? formatDate(dateInput) : String(value)
  }

  /**
   * Format a timestamp or Date as organization-formatted local date plus 24-hour time.
   * Date-only values remain date-only so calendar dates do not acquire an invented time.
   */
  function formatTimestamp(value: string | Date | null | undefined): string {
    if (!value) return ''
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(value)
    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) return String(value)
    const dateInput = localDateInput(date)
    if (!dateInput) return String(value)
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${formatDate(dateInput)} ${hours}:${minutes}`
  }

  /**
   * Format a date string (YYYY-MM-DD) according to the org's date format setting.
   * Returns an empty string for null/undefined values.
   */
  function formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return ''
    const [year, month, day] = dateStr.split('-')
    if (!year || !month || !day) return dateStr
    switch (dateFormat.value) {
      case 'dmy': return `${day}/${month}/${year}`
      case 'ymd': return `${year}-${month}-${day}`
      case 'mdy':
      default: return `${month}/${day}/${year}`
    }
  }

  async function updateSettings(payload: {
    nameDisplayFormat?: 'first_last' | 'last_first'
    dateFormat?: 'mdy' | 'dmy' | 'ymd'
    retentionEnabled?: boolean
    retentionMonths?: number
    quarantineDays?: number
    privacyPolicyUrl?: string | null
    privacyPolicyText?: string | null
    privacyContactEmail?: string | null
  }) {
    await $fetch('/api/org-settings', {
      method: 'PATCH',
      body: payload,
    })
    await refresh()
  }

  return {
    settings: data,
    nameDisplayFormat,
    dateFormat,
    status,
    formatCandidateName,
    formatPersonName,
    formatDate,
    formatDateTime,
    formatTimestamp,
    updateSettings,
    refresh,
  }
}
