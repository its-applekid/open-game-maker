import { defineConfig } from '@playwright/test';

const angle = process.env.GM_VERIFY_SOFTWARE_GL === '1' ? 'swiftshader' : 'gl-egl';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  /* SwiftShader on a busy runner is slow; the close animation hides a panel only after it finishes */
  expect: { timeout: 15_000 },
  workers: 1,
  use: {
    headless: true,
    launchOptions: {
      args: [`--use-angle=${angle}`, '--enable-gpu', '--ignore-gpu-blocklist'],
    },
  },
});
