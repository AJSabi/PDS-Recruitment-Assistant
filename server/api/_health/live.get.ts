/**
 * Process liveness probe. Keep this dependency-free: a live process should
 * answer even when downstream services are unavailable. Railway can use the
 * readiness probe for traffic admission.
 */
export default defineEventHandler((event) => {
  setHeader(event, 'cache-control', 'no-store')
  return {
    status: 'ok',
    service: 'pds-recruitment-assistant',
    check: 'liveness',
  }
})
