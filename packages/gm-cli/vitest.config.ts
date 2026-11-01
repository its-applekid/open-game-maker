import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Archive and image fixtures are I/O-heavy; serial files keep unrelated command smoke tests responsive.
    maxWorkers: 1,
  },
});
