import { expect, test } from '@playwright/test';

type HostSnapshot = { route: string; registered: string[] };

declare global {
  interface Window {
    __ogmHost?: { snapshot(): HostSnapshot };
  }
}

test('loads the title and exposes the opt-in test hook', async ({ page }) => {
  await page.goto('/?test');

  await expect(page.getByRole('heading', { name: 'Open Game Maker 2000' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__ogmHost?.snapshot())).toEqual({ route: '/', registered: [] });
});

test('serves a deep SPA link through preview', async ({ page }) => {
  await page.goto('/games');

  await expect(page).toHaveURL(/\/signin\?next=%2Fgames$/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('keeps the legacy new-game hash working', async ({ page }) => {
  await page.goto('/#new');

  await expect(page).toHaveURL(/\/signin\?next=%2Fnew$/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});
