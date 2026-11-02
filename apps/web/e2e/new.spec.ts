import { expect, test, type Locator, type Page } from '@playwright/test';

import { installAuthRoutes } from './fixtures/auth-routes';
import { installNewRoutes } from './fixtures/new-routes';

type NewGameTestApi = {
  step: string;
  picks: Record<string, { picks?: string[] } | undefined>;
  sessionId?: string;
};

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

test('phone creation flow reaches scope admission and queues at reset', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone acceptance path');
  await installAuthRoutes(page, { signedIn: true, github: 'kim' });
  const routes = await installNewRoutes(page);
  const adventure = await openReadyNewGame(page);

  const tile = await adventure.boundingBox();
  expect(tile!.width).toBeGreaterThanOrEqual(64);
  expect(tile!.height).toBeGreaterThanOrEqual(64);
  await selectOption(page, adventure, 'genre', 'adventure');
  await activate(page, 'Next');

  await activate(page, 'Other');
  await activate(page, 'Type it');
  await page.getByRole('textbox', { name: 'Your own vibe' }).fill('Moonlit');
  await activate(page, 'Add');
  await expect(page.getByText('“Moonlit”')).toBeVisible();
  await activate(page, 'Next');

  await expect(page.getByRole('button', { name: 'Pixel art' })).toBeVisible();
  await expect(page.getByText('SmallScaleInt')).toHaveCount(0);
  await activate(page, 'Pixel art');
  await activate(page, 'SmallScaleInt');
  await expect(page.getByRole('heading', { name: 'SmallScaleInt' })).toBeVisible();
  await expect(page.locator('.new-style-detail video')).toHaveCount(2);
  await expect(page.locator('.new-style-detail canvas')).toHaveCount(0);
  await expect
    .poll(() =>
      page
        .locator('.new-style-detail img')
        .evaluateAll((images) => images.every((image) => image instanceof HTMLImageElement && image.naturalWidth > 0)),
    )
    .toBe(true);
  await activate(page, 'Select SmallScaleInt');
  await expect.poll(() => newGameState(page).then((state) => state?.picks.family?.picks)).toContain('smallscaleint');
  await activate(page, 'Next');
  await selectOption(page, page.getByRole('button', { name: 'Sky islands' }), 'world', 'sky');
  await activate(page, 'Next');
  await selectOption(page, page.getByRole('button', { name: 'Solo' }), 'players', 'single');
  await activate(page, 'Next');
  await selectOption(page, page.getByRole('button', { name: 'Isometric' }), 'view', 'iso');
  await activate(page, 'Next');

  await expect(page.getByText('“Moonlit”')).toBeVisible();
  await expect(page.getByText('Three small islands will make a good first version.')).toBeVisible();
  await page.getByRole('textbox', { name: 'Message the builder' }).fill('Keep the first version small.');
  await activate(page, 'Send');
  await expect(page.getByText('Keep the first version small.')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Finish' })).toBeEnabled({ timeout: 5_000 });

  const testApi = await page.evaluate(() => {
    const api = window.__ogmHost?.get('new') as NewGameTestApi;
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

async function openReadyNewGame(page: Page): Promise<Locator> {
  await page.goto('/new?test&step=genre');
  const adventure = page.getByRole('button', { name: 'Adventure' });
  await Promise.all([page.waitForFunction(() => window.__ogmHost?.get('new') !== undefined), adventure.waitFor()]);
  return adventure;
}

async function selectOption(page: Page, button: Locator, key: string, id: string): Promise<void> {
  await expect(button).toBeVisible();
  await button.evaluate((element: HTMLButtonElement) => element.click());
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => newGameState(page).then((state) => state?.picks[key]?.picks)).toContain(id);
}

function newGameState(page: Page): Promise<NewGameTestApi | undefined> {
  return page.evaluate(() => window.__ogmHost?.get('new') as NewGameTestApi | undefined);
}

async function activate(page: Page, name: string | RegExp) {
  const button = page.getByRole('button', { name });
  await expect(button).toBeVisible();
  await button.evaluate((element: HTMLButtonElement) => element.click());
}
