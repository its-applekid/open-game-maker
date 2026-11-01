import { defineConfig, devices } from '@playwright/test';

import { launchArgs } from './e2e/support/gpu';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:43170',
    launchOptions: { args: launchArgs() },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm exec vite preview --host 127.0.0.1 --port 43170',
    url: 'http://127.0.0.1:43170',
    reuseExistingServer: false,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'phone',
      use: { ...devices['iPhone 13'], defaultBrowserType: undefined },
    },
  ],
});
