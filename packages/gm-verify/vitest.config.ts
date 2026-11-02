import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'scenarios/**/*.test.ts'],
    exclude: ['test/**/*.browser.test.ts'],
  },
});
