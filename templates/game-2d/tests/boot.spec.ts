import { expect, test } from '@playwright/test';

test('boots, advances deterministically, and draws a non-blank frame', async ({ page }) => {
  await page.goto('/?build=test', { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__ready === true);

  const initialTick = await page.evaluate(() => window.__gm!.renderGameToText().tick);
  await page.evaluate(() => {
    const hooks = window.__gm!;
    hooks.advanceTime(0);
    hooks.advanceTime(0);
  });
  expect(await page.evaluate(() => window.__gm!.renderGameToText().tick)).toBe(initialTick);

  const before = await page.evaluate(() => window.__gm!.renderInfo());
  const variance = await page.evaluate(() => {
    window.__frame!(0.5);
    const canvas = document.querySelector('canvas');
    if (!canvas) return 0;
    const gl = canvas.getContext('webgl');
    if (!gl) return 0;
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let minimum = Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < pixels.length; index += 4) {
      const luminance = pixels[index]! + pixels[index + 1]! + pixels[index + 2]!;
      minimum = Math.min(minimum, luminance);
      maximum = Math.max(maximum, luminance);
    }
    return maximum - minimum;
  });
  const after = await page.evaluate(() => window.__gm!.renderInfo());

  expect(after.calls - before.calls).toBe(1);
  expect(after.backend).toBe('webgl');
  expect(variance).toBeGreaterThan(0);

  await page.evaluate(() => window.__gm!.advanceTime(500));
  expect(await page.evaluate(() => window.__gm!.renderGameToText().tick)).toBe(60);
  console.info(`render backend: ${after.backend}`);
});

test('published builds do not expose draft test globals', async ({ page }) => {
  await page.goto('/?build=published', { waitUntil: 'commit' });
  await page.waitForSelector('canvas');

  expect(await page.evaluate(() => window.__gm)).toBeUndefined();
});
