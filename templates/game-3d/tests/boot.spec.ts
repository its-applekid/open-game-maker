import { expect, test } from '@playwright/test';
import type {} from '@gm/sdk/test';

test('boots, advances deterministically, and renders a non-blank frame', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto('/?build=test');
  await page.waitForFunction(() => window.__ready === true, undefined, { timeout: 60_000 });
  await page.evaluate(() => window.advanceTime?.(1_000));

  const text = await page.evaluate(() => window.render_game_to_text?.());
  expect(JSON.parse(text ?? '{}')).toMatchObject({ tick: 60, coords: expect.stringContaining('3d world') });
  await page.evaluate(() => window.__frame?.(0.5));
  const rewound = await page.evaluate(() => window.render_game_to_text?.());
  expect(JSON.parse(rewound ?? '{}')).toMatchObject({ tick: 30 });

  const rendered = await page.evaluate(() => {
    const source = document.querySelector<HTMLCanvasElement>('#game');
    if (!source) return { variance: 0, backend: '' };
    const copy = document.createElement('canvas');
    copy.width = 64;
    copy.height = 64;
    const context = copy.getContext('2d');
    context?.drawImage(source, 0, 0, 64, 64);
    const pixels = context?.getImageData(0, 0, 64, 64).data ?? new Uint8ClampedArray();
    let sum = 0;
    let sumSquares = 0;
    for (const value of pixels) {
      sum += value;
      sumSquares += value * value;
    }
    const count = Math.max(1, pixels.length);
    const mean = sum / count;
    return { variance: sumSquares / count - mean * mean, backend: window.__gm?.renderInfo().backend ?? '' };
  });

  expect(rendered.variance).toBeGreaterThan(0);
  const launchArgs = testInfo.project.use.launchOptions?.args ?? [];
  const expectedBackend = launchArgs.includes('--use-angle=swiftshader') ? /SwiftShader/i : /ANGLE/i;
  expect(rendered.backend).toMatch(expectedBackend);
  expect(errors).toEqual([]);
  console.log(`Renderer backend: ${rendered.backend}`);
  testInfo.annotations.push({ type: 'renderer', description: rendered.backend });
});
