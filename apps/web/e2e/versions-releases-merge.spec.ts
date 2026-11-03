import { expect, test, type Locator } from '@playwright/test';

import { installAuthRoutes } from './fixtures/auth-routes';
import { installVersioningRoutes } from './fixtures/versioning-routes';

test.use({ serviceWorkers: 'block' });

test('shows derived versions and disables creation at five active versions', async ({ page }, testInfo) => {
  test.slow(); // this case reloads the shell after the cross-origin game frame has connected
  const api = await installVersioningRoutes(page);
  await installAuthRoutes(page, { signedIn: true });
  await page.goto('/g/game/versions?v=main');

  await expect(page.getByRole('article', { name: /version$/ })).toHaveCount(3);
  await expect(page.getByRole('article', { name: 'main version' })).toContainText('2.1.0');
  await expect(page.getByRole('article', { name: 'ae3 version' })).toContainText('0.3.0');
  await expect(page.getByRole('button', { name: 'New version from here' })).toBeEnabled();
  if (testInfo.project.name === 'phone') {
    await expectTarget(page.getByRole('button', { name: 'Switch to main' }), 64);
    await expectTarget(page.getByRole('button', { name: 'Play main' }), 64);
  }

  api.useFiveActiveVersions();
  await page.reload({ waitUntil: 'domcontentloaded' });
  const create = page.getByRole('button', { name: 'New version from here' });
  await expect(page.getByText('5 of 5')).toBeVisible();
  await expect(create).toBeDisabled();

  if (testInfo.project.name === 'phone') {
    await expectTarget(create, 64);
    await expectTarget(page.getByRole('button', { name: 'Archive ae3' }), 44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test('publishes edited preview text only from main', async ({ page }, testInfo) => {
  test.slow(); // this case opens a second game shell to prove the branch-specific publish gate
  const api = await installVersioningRoutes(page);
  await installAuthRoutes(page, { signedIn: true });
  await page.goto('/g/game/releases?v=main');

  const publish = page.getByRole('button', { name: 'Publish' });
  if (testInfo.project.name === 'phone') await expectTarget(publish, 64);
  await publish.click();
  const changelog = page.getByRole('textbox', { name: 'What changed' });
  await expect(changelog).toHaveValue('Door puzzles\n\nA locked cellar door');
  await changelog.fill('A sharper release note');
  await page.getByRole('button', { name: 'Publish 2.2.0' }).click();
  await expect
    .poll(() => api.publishes)
    .toEqual([{ buildId: 'build_main', changelog: { summary: 'A sharper release note', items: [] } }]);

  await page.goto('/g/game/releases?v=ae3', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Releases' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publish' })).toHaveCount(0);
});

test('previews affected saves before rollback', async ({ page }) => {
  const api = await installVersioningRoutes(page);
  await installAuthRoutes(page, { signedIn: true });
  await page.goto('/g/game/releases?v=main');

  await page.getByRole('button', { name: 'Roll back to 2.0.0' }).click();
  await expect(page.getByText('3 saves will stop loading until you publish again.')).toBeVisible();
  await page.getByRole('button', { name: 'Roll back to 2.0.0' }).last().click();
  await expect.poll(() => api.rollbacks).toEqual([{ releaseId: 'release_200' }]);
});

test('resolves the AE3 conflict, previews, and lands with one target lease', async ({ page }, testInfo) => {
  const api = await installVersioningRoutes(page);
  await installAuthRoutes(page, { signedIn: true });
  await page.goto('/g/game/merge/plan_ae3?target=main');

  await expect(page.getByText('Mine:')).toContainText('false');
  await expect(page.getByText('Theirs:')).toContainText('true');
  await expect(page.getByLabel('Mine')).toBeVisible();
  await expect(page.getByLabel('Theirs')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Both' })).toHaveCount(0);
  if (testInfo.project.name === 'phone') {
    await expectTarget(page.getByRole('button', { name: 'Land' }), 64);
    await expectTarget(page.getByRole('button', { name: 'Abandon' }), 44);
  }
  await page.getByRole('button', { name: 'Keep all of mine' }).click();
  await expect.poll(() => api.resolveAll).toEqual([{ resolution: 'ours' }]);

  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.getByRole('heading', { name: 'Preview ready' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Land' })).toBeEnabled();
  await page.getByRole('button', { name: 'Land' }).click();
  await expect(page).toHaveURL(/\/g\/game\?v=main$/);

  expect(api.leases).toHaveLength(2);
  expect(api.leases[0]).toMatchObject({ method: 'POST', body: { sessionId: expect.any(String) } });
  const sessionId = api.leases[0]!.body.sessionId;
  expect(api.lands).toEqual([{ sessionId, token: 8 }]);
  expect(api.leases[1]).toEqual({ method: 'DELETE', body: { sessionId, token: 8 } });
});

async function expectTarget(locator: Locator, minimum: number): Promise<void> {
  const box = await locator.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(minimum);
  expect(box?.height).toBeGreaterThanOrEqual(minimum);
}
