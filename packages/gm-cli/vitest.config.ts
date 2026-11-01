import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Archive and image fixtures are I/O-heavy; serial files keep unrelated command smoke tests responsive.
    maxWorkers: 1,
    // The first test in each file cold-loads every command module through the transformer.
    testTimeout: 20_000,
  },
});
