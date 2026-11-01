import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false,
    hookTimeout: 10_000,
    testTimeout: 10_000,
  },
});
