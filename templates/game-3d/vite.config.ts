import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  define: {
    __GM_BUILD__: JSON.stringify(process.env.GM_BUILD ?? 'test'),
  },
  resolve: {
    alias: {
      pixelfx: fileURLToPath(new URL('../../third_party/pixelfx/src', import.meta.url)),
    },
  },
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1', port: 43173 },
  build: { target: 'es2022' },
});
