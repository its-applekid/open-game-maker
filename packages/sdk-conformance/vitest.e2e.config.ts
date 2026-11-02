import { defineConfig } from 'vitest/config';

/* Builds and boots real templates in Chromium; run on this host (GPU) or with GM_VERIFY_SOFTWARE_GL=1. */
export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts'],
    testTimeout: 600_000,
    hookTimeout: 600_000,
    fileParallelism: false,
  },
});
