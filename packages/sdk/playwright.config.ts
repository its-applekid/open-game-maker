import { defineConfig } from '@playwright/test';
import { env } from 'node:process';

const angle = env.GM_VERIFY_SOFTWARE_GL === '1' ? 'swiftshader' : 'gl-egl';

export default defineConfig({
  testDir: './src/audio',
  testMatch: 'browser.spec.ts',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4181',
    browserName: 'chromium',
    launchOptions: {
      args: [
        '--autoplay-policy=no-user-gesture-required',
        `--use-angle=${angle}`,
        '--enable-gpu',
        '--ignore-gpu-blocklist',
      ],
    },
  },
  webServer: {
    command: 'tsx src/audio/fixture/server.ts',
    url: 'http://127.0.0.1:4181/health',
    reuseExistingServer: false,
  },
});
