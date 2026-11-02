import { defineConfig } from '@playwright/test';
import { env } from 'node:process';

const angle = env.GM_VERIFY_SOFTWARE_GL === '1' ? 'swiftshader' : 'gl-egl';

export default defineConfig({
  testDir: './test/browser',
  testMatch: '**/*.spec.ts',
  timeout: 90_000,
  use: {
    browserName: 'chromium',
    launchOptions: { args: [`--use-angle=${angle}`, '--enable-gpu', '--ignore-gpu-blocklist'] },
  },
});
