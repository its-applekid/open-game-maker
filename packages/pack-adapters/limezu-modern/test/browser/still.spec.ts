import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';
import { build } from 'esbuild';

const here = fileURLToPath(new URL('.', import.meta.url));

test('a 6x6 autotiled fixture map renders on the GPU', async ({ page }) => {
  const bundle = await build({
    entryPoints: [`${here}/scene.ts`],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
  });
  await page.setContent(
    `<!doctype html><body style="margin:0;background:#000"><script>${bundle.outputFiles[0]!.text}</script></body>`,
  );
  await page.waitForFunction(() => 'fixture' in window);
  const fixture = await page.evaluate(() => (window as unknown as { fixture: { renderer: number } }).fixture);
  expect(fixture.renderer).toBe(2 /* Phaser.WEBGL */);
  const gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return info ? String(gl!.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  });
  test.info().annotations.push({ type: 'gpu', description: gpu });
  mkdirSync(`${here}/../../test-results`, { recursive: true });
  await page.locator('canvas').screenshot({ path: `${here}/../../test-results/autotile-6x6.png` });
});
