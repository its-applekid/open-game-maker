import { defineConfig } from '@playwright/test';

const gpuArgs = ['--use-angle=gl-egl', '--enable-gpu', '--ignore-gpu-blocklist'];
const softwareArgs = ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'];

export default defineConfig({
  testDir: './src/browser',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    launchOptions: { args: process.env.GM_VERIFY_SOFTWARE_GL ? softwareArgs : gpuArgs },
  },
  webServer: {
    command:
      // The harness loads game-3d as a test build (test/app/main.ts), so build it in vite's
      // test mode explicitly rather than through its published `build` script or a default build.
      'pnpm --filter @gm/template-game-2d build && pnpm --filter @gm/template-game-3d exec vite build --mode test && pnpm exec tsx test/serve.ts',
    url: 'http://127.0.0.1:4173/health',
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
