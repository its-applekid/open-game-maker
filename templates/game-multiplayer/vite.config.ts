import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  define: {
    __GM_BUILD__: JSON.stringify(mode === 'published' ? 'published' : mode === 'test' ? 'test' : 'draft'),
  },
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
}));
