import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The first test in each file cold-loads every command module through the transformer.
    testTimeout: 20_000,
  },
});
