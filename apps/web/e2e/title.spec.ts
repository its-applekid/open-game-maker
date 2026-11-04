import { readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import { installAuthRoutes } from './fixtures/auth-routes';

type StubbedWindow = Window & { __tapSeen?: [number, number]; __ogmHost?: { get(name: string): unknown } };

const stub = readFileSync(new URL('./fixtures/town-stub/index.html', import.meta.url), 'utf8');
// a 1×1 PNG served as the poster; CSS stretches it full-bleed
const poster = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

// the built town (tools/town.sh) is not in CI: serve the stub and a poster in its place
async function stubTown(page: Page) {
  await page.route('**/town/index.html*', (route) => route.fulfill({ contentType: 'text/html', body: stub }));
  await page.route('**/town/models/bake/poster-*', (route) =>
    route.fulfill({ contentType: 'image/png', body: poster }),
  );
}

test.use({ serviceWorkers: 'block' });

test.beforeEach(({ page }) => installAuthRoutes(page));

test('the server paints the poster before the app module loads', async ({ page }) => {
  await stubTown(page);
  let releaseApp!: () => void;
  const appHeld = new Promise<void>((resolve) => {
    releaseApp = resolve;
  });
  await page.route('**/assets/index-*.js', async (route) => {
    await appHeld;
    await route.continue();
  });

  try {
    await page.goto('/', { waitUntil: 'commit' });
    await expect(page.locator('#initial-title-poster img')).toBeVisible();
  } finally {
    releaseApp();
    await page.unrouteAll({ behavior: 'wait' });
  }
});

test('title paints the poster first, then fades in the live town', async ({ page }) => {
  await stubTown(page);
  await page.goto('/?test', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('.t-poster img')).toBeVisible();
  await expect(page.locator('.title-town')).toHaveClass(/\blive\b/, { timeout: 4000 });
  await expect(page.locator('.t-poster')).toHaveCount(0);
  const live = () => ((window as StubbedWindow).__ogmHost?.get('title') as { live(): boolean }).live();
  expect(await page.evaluate(live)).toBe(true);
});

test('title passes a tap on the town through to it', async ({ page }) => {
  await stubTown(page);
  await page.goto('/');
  await expect(page.locator('.title-town')).toHaveClass(/\blive\b/, { timeout: 4000 });

  const box = (await page.locator('.title-town').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  await expect.poll(() => page.evaluate(() => (window as StubbedWindow).__tapSeen)).toEqual([0.5, 0.5]);
});

test('title Start is a primary-size target and the sound toggle is labelled', async ({ page }) => {
  await stubTown(page);
  await page.goto('/');

  const start = page.getByRole('button', { name: 'Start', exact: true });
  const box = (await start.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(64);
  await expect(page.getByRole('button', { name: /sound/i })).toBeVisible();

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page).toHaveURL(/\/signin\?next=%2Fconnect%2Fgithub$/);
  await expect(page.locator('.title-town iframe')).toHaveCount(0);
});
