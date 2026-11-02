import { readFileSync } from 'node:fs';

import type { Page } from '@playwright/test';

type GamesFixture = {
  games: unknown[];
  jobs: unknown[];
  branches: Record<string, unknown[]>;
};

const fixture = JSON.parse(readFileSync(new URL('./games.json', import.meta.url), 'utf8')) as GamesFixture;
const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

export async function mockGamesRoutes(page: Page): Promise<void> {
  await page.route('**/api/v1/notifications/stream', (route) =>
    route.fulfill({ contentType: 'text/event-stream', body: 'retry: 60000\n\n' }),
  );
  await page.route('**/api/v1/games', (route) => route.fulfill({ json: { games: fixture.games } }));
  await page.route('**/api/v1/jobs?state=active', (route) => route.fulfill({ json: { jobs: fixture.jobs } }));
  await page.route('**/api/v1/games/*/branches', (route) => {
    const gameId = new URL(route.request().url()).pathname.split('/').at(-2)!;
    const branches = fixture.branches[gameId];
    return branches
      ? route.fulfill({ json: { branches } })
      : route.fulfill({ status: 404, json: { error: 'not_found' } });
  });
  await page.route('https://example.test/cover.png', (route) =>
    route.fulfill({ contentType: 'image/png', body: pixel }),
  );
}
