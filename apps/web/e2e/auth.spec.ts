import { expect, test } from '@playwright/test';

import { installAuthRoutes } from './fixtures/auth-routes';

test.use({ serviceWorkers: 'block' });

test('Start goes straight to the magic-link sent state', async ({ page }) => {
  await installAuthRoutes(page);
  await page.goto('/');

  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page).toHaveURL(/\/signin\?next=%2Fconnect%2Fgithub$/);
  const sendButton = page.getByRole('button', { name: 'Send sign-in link' });
  expect((await sendButton.boundingBox())!.height).toBeGreaterThanOrEqual(64);
  await page.getByLabel('Email').fill('kim@example.com');
  await sendButton.click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
});

test('a protected route sends a signed-out visitor to sign in and preserves next', async ({ page }) => {
  await installAuthRoutes(page);
  await page.goto('/games?test');

  await expect(page).toHaveURL(/\/signin\?next=%2Fgames$/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('a signed-in creator sees the connected GitHub account', async ({ page }) => {
  await installAuthRoutes(page, { signedIn: true, github: 'octocat' });
  await page.goto('/connect/github');

  await expect(page.getByText('@octocat')).toBeVisible();
  await expect(page.getByRole('button', { name: /private/i })).toHaveAttribute('aria-pressed', 'true');
});
