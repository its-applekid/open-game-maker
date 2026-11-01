import { devices, defineConfig } from '@playwright/test';
import { env } from 'node:process';

const softwareGl = env.GM_VERIFY_SOFTWARE_GL === '1';
const executablePath = env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  testDir: './test/browser',
  fullyParallel: false,
  workers: 1,
  use: {
    ...devices['Desktop Chrome'],
    headless: true,
    launchOptions: {
      args: [softwareGl ? '--use-angle=swiftshader' : '--use-angle=gl-egl', '--enable-gpu', '--ignore-gpu-blocklist'],
      ...(executablePath ? { executablePath } : {}),
    },
  },
});
