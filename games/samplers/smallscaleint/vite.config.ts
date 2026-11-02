import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  // Licensed media stays local: a published build neither copies public/assets-local nor loads it.
  const published = mode === 'published';
  return {
    define: {
      __GM_BUILD__: JSON.stringify(published ? 'published' : mode === 'test' ? 'test' : 'draft'),
      __GM_PRIVATE_ASSETS__: JSON.stringify(!published && existsSync(resolve('public/assets-local/manifest.json'))),
    },
    publicDir: published ? false : 'public',
    server: { host: '127.0.0.1' },
    preview: { host: '127.0.0.1' },
  };
});
