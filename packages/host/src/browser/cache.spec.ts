import { expect, test } from '@playwright/test';

test('serves a game asset through the cache worker on reload', async ({ page }) => {
  await page.goto('/');
  const game = page.frames().find((frame) => frame.url().includes('/g/'))!;
  await game.evaluate(() => window.__cacheReady);

  let workerResponses = 0;
  page.on('response', (response) => {
    if (response.url().includes('/assets/') && response.fromServiceWorker()) workerResponses += 1;
  });
  await page.reload();
  await expect.poll(() => workerResponses).toBeGreaterThanOrEqual(1);
});
