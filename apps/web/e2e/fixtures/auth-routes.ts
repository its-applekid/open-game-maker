import type { Page, Route } from '@playwright/test';

type AuthFixture = { signedIn?: boolean; github?: string };

export async function installAuthRoutes(page: Page, fixture: AuthFixture = {}) {
  await page.route('**/auth/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/auth/age' && request.method() === 'POST') return empty(route, 204);
    if (path === '/auth/providers') return json(route, { providers: ['magic-link', 'passkey'] });
    if (path === '/auth/get-session') {
      return json(
        route,
        fixture.signedIn
          ? {
              user: { id: 'u1', name: 'Kim', email: 'kim@example.com' },
              session: { id: 's1', userId: 'u1', expiresAt: new Date(Date.now() + 86_400_000).toISOString() },
            }
          : null,
      );
    }
    if (path === '/auth/sign-in/magic-link' && request.method() === 'POST') return json(route, { status: true });
    if (path === '/auth/list-accounts') {
      return json(route, fixture.github ? [{ providerId: 'github', accountId: fixture.github }] : []);
    }
    if (path === '/auth/passkey/list-user-passkeys') return json(route, []);
    return json(route, { code: 'NOT_MOCKED', path }, 404);
  });
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function empty(route: Route, status: number) {
  await route.fulfill({ status, body: '' });
}
