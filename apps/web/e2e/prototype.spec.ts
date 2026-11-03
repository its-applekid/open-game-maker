import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test('loads the staged studio prototype under /proto/', async ({ page }) => {
  // This smoke proves the deploy payload and static title shell; the archived WebGL loop has its own frozen behavior.
  await page.route('**/proto/**/*.js', (route) => route.abort());
  await page.goto('/proto/', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('#s-title')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Open Game Maker 2000' })).toBeVisible();
});
