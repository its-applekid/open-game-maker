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
  // Browser coverage stays on GIF fallbacks; the component spec owns video playback and synchronization.
  await expect(page.locator('.new-style-detail video')).toHaveCount(0);
  await expect(page.locator('.new-style-detail canvas')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Previous style' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next style' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Previous scene' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next scene' })).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator('.new-style-detail img')
        .evaluateAll((images) => images.every((image) => image instanceof HTMLImageElement && image.naturalWidth > 0)),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.locator('.new-style-track').evaluateAll((tracks) =>
        tracks.every((track) => {
          const box = track.getBoundingClientRect();
          return Math.abs(box.width - box.height) <= 1;
        }),
      ),
    )
    .toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(
    true,
  );
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

test('style detail fits its media and navigation into phone and desktop viewports', async ({ page }) => {
  test.setTimeout(90_000);
  await installAuthRoutes(page, { signedIn: true, github: 'kim' });
  await installNewRoutes(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/new?test&step=family');
  await page.waitForFunction(() => window.__ogmHost?.get('new') !== undefined);

  const familyIcons = page.locator('[data-style-family] .new-option-icon svg');
  await expect(familyIcons).toHaveCount(5);
  expect(await familyIcons.evaluateAll((icons) => icons.every((icon) => icon.getBoundingClientRect().width > 0))).toBe(
    true,
  );

  await page.getByRole('button', { name: 'Isometric' }).dispatchEvent('click');
  await page.locator('.new-style-detail').waitFor({ state: 'attached' });

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 844, height: 390 },
    { width: 1280, height: 720 },
  ]) {
    await test.step(`${viewport.width}x${viewport.height}`, async () => {
      await page.setViewportSize(viewport);
      await page.evaluate(() => window.scrollTo(0, 0));
      const controls = page.locator(
        'button[aria-label="Previous scene"], button[aria-label="Next scene"], button[aria-label="Previous style"], button[aria-label="Next style"]',
      );
      const tracks = page.locator('.new-style-track');
      const stopRow = page.locator('.new-style-stops');

      await expect(controls).toHaveCount(4);
      await expect(tracks).toHaveCount(2);
      await expect(stopRow).toHaveCount(1);
      const boxesFor = (elements: Element[]) =>
        elements.map((element) => {
          const box = element.getBoundingClientRect();
          return {
            width: box.width,
            height: box.height,
            top: box.top,
            right: box.right,
            bottom: box.bottom,
            left: box.left,
            rendered: box.width > 0 && box.height > 0,
            horizontallyContained: box.left >= 0 && box.right <= window.innerWidth,
            inViewport:
              box.width > 0 &&
              box.height > 0 &&
              box.top >= 0 &&
              box.left >= 0 &&
              box.bottom <= window.innerHeight &&
              box.right <= window.innerWidth,
          };
        });
      const [controlBoxes, trackBoxes, stopRowBoxes] = await Promise.all([
        controls.evaluateAll(boxesFor),
        tracks.evaluateAll(boxesFor),
        stopRow.evaluateAll(boxesFor),
      ]);
      const [diorama, sheet] = trackBoxes;
      const measured = [...controlBoxes, ...trackBoxes, ...stopRowBoxes];

      expect(controlBoxes).toHaveLength(4);
      expect(trackBoxes).toHaveLength(2);
      expect(stopRowBoxes).toHaveLength(1);
      expect(measured.every(({ rendered, horizontallyContained }) => rendered && horizontallyContained)).toBe(true);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
      ).toBe(true);
      if (viewport.height >= 720) {
        expect(measured.every(({ inViewport }) => inViewport)).toBe(true);
      } else {
        const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
        expect(scrollHeight).toBeGreaterThan(viewport.height);
        expect(measured.every(({ top, bottom }) => top >= 0 && bottom <= scrollHeight)).toBe(true);
      }
      expect(Math.abs(diorama!.width - diorama!.height)).toBeLessThanOrEqual(1);
      expect(Math.abs(sheet!.width - sheet!.height)).toBeLessThanOrEqual(1);
      expect(Math.abs(diorama!.width - sheet!.width)).toBeLessThanOrEqual(1);
    });
  }

  const [sceneArrowBackground, styleArrowBackground] = await Promise.all([
    page.getByRole('button', { name: 'Previous scene' }).evaluate((button) => getComputedStyle(button).backgroundColor),
    page.getByRole('button', { name: 'Previous style' }).evaluate((button) => getComputedStyle(button).backgroundColor),
  ]);
  expect(sceneArrowBackground).not.toBe(styleArrowBackground);
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
