import { devices, expect, test } from '@playwright/test';

const iphone = devices['iPhone 13'];
test.use({
  viewport: iphone.viewport,
  userAgent: iphone.userAgent,
  deviceScaleFactor: iphone.deviceScaleFactor,
  isMobile: iphone.isMobile,
  hasTouch: iphone.hasTouch,
});

test('completes the cross-origin handshake and ignores a forged ready', async ({ page }) => {
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => window.__host.ready.length)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__host.ready[0]?.id)).toBe('browser-fixture');

  await page.evaluate(() => window.__host.forge());
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.__host.ready.length)).toBe(1);
});

test('relays audio from the game to the app', async ({ page }) => {
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => window.__host.ready.length)).toBe(1);
  await page
    .frameLocator('iframe[title="Game"]')
    .getByRole('button', { name: 'relay audio' })
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect.poll(() => page.evaluate(() => window.__host.relays.length)).toBe(1);
  expect(await page.evaluate(() => window.__host.relays[0])).toMatchObject({ cue: 'jump', vol: 0.5 });
});

test('delivers a touch action frame to the game', async ({ page }) => {
  await page.goto('/');
  const stick = page.getByRole('button', { name: 'move' });
  await expect(stick).toBeVisible();
  const box = await stick.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;
  await stick.dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: x, clientY: y });
  await stick.dispatchEvent('pointermove', { pointerId: 1, pointerType: 'touch', clientX: x + 30, clientY: y });
  await stick.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'touch', clientX: x + 30, clientY: y });

  const game = page.frames().find((frame) => frame.url().includes('/g/'))!;
  await game.waitForFunction(() => window.__frames.some((frame) => frame.source === 'touch'));
  const frames = await game.evaluate(() => window.__frames);
  expect(frames).toContainEqual(expect.objectContaining({ playerIndex: 0, source: 'touch' }));
});

test('passes taps outside the controls through to the game', async ({ page }) => {
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => window.__host.ready.length)).toBe(1);

  const canvas = page.frameLocator('iframe[title="Game"]').locator('#canvas');
  await canvas.click({ force: true });

  const game = page.frames().find((frame) => frame.url().includes('/g/'))!;
  await expect.poll(() => game.evaluate(() => window.__taps)).toBe(1);
});
