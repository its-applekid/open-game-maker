import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.browser.test.ts'],
    testTimeout: 180_000,
    fileParallelism: false,
  },
});
