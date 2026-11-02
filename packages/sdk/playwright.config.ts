import { defineConfig } from '@playwright/test';
import { env } from 'node:process';

const angle = env.GM_VERIFY_SOFTWARE_GL === '1' ? 'swiftshader' : 'gl-egl';
const port = Number(env.SDK_AUDIO_TEST_PORT ?? 4181);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './src/audio',
  testMatch: 'browser.spec.ts',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL,
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
    url: `${baseURL}/health`,
    reuseExistingServer: false,
    env: { SDK_AUDIO_TEST_PORT: String(port) },
  },
});
