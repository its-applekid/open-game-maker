import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Every `makeApp()` scans the auth context, whose setup reads these names; values are test-only.
    env: {
      OGM_APP_ORIGIN: 'https://makeopen.games',
      OGM_SESSION_SECRET: 'session-secret-for-tests-0123456789abcdef',
      OGM_AGE_COOKIE_SECRET: 'age-cookie-secret-for-tests-0123456789',
      OGM_WS_TOKEN_SECRET: 'ws-token-secret-for-tests-0123456789',
      OGM_MAINTAINER_EMAILS: '',
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      SMTP_URL: '',
      SMTP_FROM: '',
    },
    // The first Better Auth import in a worker takes several seconds.
    testTimeout: 20_000,
  },
});
