import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  define: {
    __GM_BUILD__: JSON.stringify(mode === 'published' ? 'published' : mode === 'test' ? 'test' : 'draft'),
    __GM_PRIVATE_ASSETS__: JSON.stringify(existsSync(resolve('public/assets-local/manifest.json'))),
  },
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
}));
