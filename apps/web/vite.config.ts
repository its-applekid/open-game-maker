import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// OGM_API_PORT is a local developer override; production requests stay same-origin.
// eslint-disable-next-line no-restricted-properties
const apiPort = process.env.OGM_API_PORT ?? '8787';
const apiTarget = `http://127.0.0.1:${apiPort}`;

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': apiTarget,
      '/auth': apiTarget,
    },
  },
  build: {
    sourcemap: true,
    target: 'es2022',
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'e2e/**/*.test.ts'],
    setupFiles: './src/test/setup.ts',
  },
});
