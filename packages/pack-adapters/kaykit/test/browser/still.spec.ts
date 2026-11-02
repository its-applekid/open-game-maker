import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

let bundle = '';

test.beforeAll(async () => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL('./main.ts', import.meta.url))],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    write: false,
  });
  bundle = result.outputFiles[0]!.text;
});

test('a retargeted idle bends the generated mesh on the GPU', async ({ page }, testInfo) => {
  await page.route('http://fixture.test/**', (route) =>
    route.request().url().endsWith('/main.js')
      ? route.fulfill({ contentType: 'text/javascript', body: bundle })
      : route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><body style="margin:0"><script type="module" src="/main.js"></script></body>',
        }),
  );
  await page.goto('http://fixture.test/');
  await expect
    .poll(() => page.evaluate(() => (window as { __still?: object }).__still), { timeout: 15_000 })
    .toBeTruthy();
  const still = await page.evaluate(
    () =>
      (window as unknown as { __still: { rest?: string; idle?: string; error?: string; backend?: string } }).__still,
  );
  expect(still.error).toBeUndefined();

  await page.locator('canvas').screenshot({ path: testInfo.outputPath('retargeted-idle.png') });
  expect(still.idle).not.toBe(still.rest);
  console.log(`renderer: ${still.backend}`);
});
