import { expect, test, type Page } from '@playwright/test';

import { installAuthRoutes } from './fixtures/auth-routes';
import { installNewRoutes } from './fixtures/new-routes';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

test('phone creation flow reaches scope admission and queues at reset', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone acceptance path');
  await installAuthRoutes(page, { signedIn: true, github: 'kim' });
  const routes = await installNewRoutes(page);
  await page.goto('/new?test&step=genre');

  const adventure = page.getByRole('button', { name: 'Adventure' });
  await expect(adventure).toBeVisible();
  const tile = await adventure.boundingBox();
  expect(tile!.width).toBeGreaterThanOrEqual(64);
  expect(tile!.height).toBeGreaterThanOrEqual(64);
  await adventure.evaluate((button: HTMLButtonElement) => button.click());
  await activate(page, 'Next');

  await activate(page, 'Other');
  await activate(page, 'Type it');
  await page.getByRole('textbox', { name: 'Your own vibe' }).fill('Moonlit');
  await activate(page, 'Add');
  await activate(page, 'Next');

  await activate(page, /SmallScaleInt/);
  await activate(page, 'Next');
  await activate(page, 'Sky islands');
  await activate(page, 'Next');
  await activate(page, 'Solo');
  await activate(page, 'Next');
  await activate(page, 'Isometric');
  await activate(page, 'Next');

  await expect(page.getByText('“Moonlit”')).toBeVisible();
  await expect(page.getByText('Three small islands will make a good first version.')).toBeVisible();
  await page.getByRole('textbox', { name: 'Message the builder' }).fill('Keep the first version small.');
  await activate(page, 'Send');
  await expect(page.getByText('Keep the first version small.')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Finish' })).toBeEnabled({ timeout: 5_000 });

  const testApi = await page.evaluate(() => {
    const api = window.__ogmHost?.get('new') as { step: string; picks: Record<string, unknown>; sessionId?: string };
    return { step: api.step, picks: api.picks, sessionId: api.sessionId };
  });
  expect(testApi.step).toBe('talk');
  expect(testApi.picks).toMatchObject({ genre: { picks: ['adventure'] }, family: { picks: ['smallscaleint'] } });
  expect(testApi.sessionId).toBeTruthy();

  await activate(page, 'Finish');
  await activate(page, 'Queue for the reset');
  await expect(page).toHaveURL(/\/games\?spotlight=g_/, { timeout: 5_000 });
  expect(routes.scopeMessages).toEqual(['Keep the first version small.']);
  expect(routes.admissions).toHaveLength(2);
  expect(routes.admissions[0]).toMatchObject({ start: 'now', idempotencyKey: expect.stringMatching(/:1$/) });
  expect(routes.admissions[1]).toMatchObject({ start: 'at_reset', idempotencyKey: expect.stringMatching(/:2$/) });
});

async function activate(page: Page, name: string | RegExp) {
  const button = page.getByRole('button', { name });
  await expect(button).toBeVisible();
  await button.evaluate((element: HTMLButtonElement) => element.click());
}
