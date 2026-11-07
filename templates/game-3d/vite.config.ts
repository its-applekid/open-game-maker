import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

import { gmBuildArtifacts } from '@gm/sdk/vite';

import { manifest } from './src/manifest.js';

export default defineConfig(({ mode }) => ({
  define: {
    __GM_BUILD__: JSON.stringify(mode === 'published' ? 'published' : mode === 'test' ? 'test' : 'draft'),
  },
  resolve: {
    alias: {
      pixelfx: fileURLToPath(new URL('../../third_party/pixelfx/src', import.meta.url)),
    },
  },
  plugins: [
    gmBuildArtifacts({
      manifest,
      designDir: fileURLToPath(new URL('./design/', import.meta.url)),
      assetsLockFile: fileURLToPath(new URL('./assets.lock.json', import.meta.url)),
      creditsFile: fileURLToPath(new URL('./CREDITS.md', import.meta.url)),
    }),
  ],
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1', port: 43173 },
  build: { target: 'es2022' },
}));
