export default defineNuxtPlugin(() => {
  useHead({
    style: [
      {
        key: 'pds-recruiter-workspace-layer',
        children: `
          [data-testid="pds-recruiter-candidate-workspace"] {
            z-index: 60 !important;
          }
        `,
      },
    ],
  })
})
