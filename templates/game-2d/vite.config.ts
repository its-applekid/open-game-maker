import { fileURLToPath } from 'node:url';

import { gmBuildArtifacts } from '@gm/sdk/vite';
import { defineConfig } from 'vite';

import { manifest } from './src/manifest.js';

export default defineConfig(({ mode }) => ({
  define: {
    __GM_BUILD__: JSON.stringify(mode === 'published' ? 'published' : mode === 'test' ? 'test' : 'draft'),
  },
  plugins: [gmBuildArtifacts({ manifest, designDir: fileURLToPath(new URL('./design/', import.meta.url)) })],
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
}));
