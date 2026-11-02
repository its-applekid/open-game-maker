import { expect, test, type Frame, type Page } from '@playwright/test';

import { installAuthRoutes } from './fixtures/auth-routes';
import { installGameApi } from './support/mock-game-api';

type GameHook = {
  bridgeState: string;
  headRev: number;
  saved: string;
  mode: string;
  selection: string[];
  dropped: number;
  readOnly: boolean;
};

type FixtureHook = { mode: string; messages: Array<{ t: string; payload: unknown }> };

test.use({ serviceWorkers: 'block' });

test('runs the cross-origin editor transaction, undo, and mode flow', async ({ page }, testInfo) => {
  await installAuthRoutes(page, { signedIn: true });
  const api = await installGameApi(page);
  await page.goto('/g/game?mode=edit&test');

  await expect.poll(() => gameState(page).then((state) => state?.bridgeState), { timeout: 5_000 }).toBe('ready');
  const before = (await gameState(page))!;
  await page.evaluate(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://third-origin.invalid',
        data: JSON.stringify({ v: 1, id: 'hostile', t: 'editor.picked', payload: { targets: [] } }),
      }),
    );
  });
  await expect.poll(() => gameState(page).then((state) => state?.dropped)).toBe(before.dropped + 1);
  expect(await gameState(page)).toMatchObject({ headRev: before.headRev, selection: before.selection });

  await page.getByRole('button', { name: 'Skeleton' }).click({ force: true });
  await page.getByLabel('Editor canvas').click({ force: true, position: { x: 180, y: 120 } });
  await expect.poll(() => api.transactions.length).toBe(1);
  expect(api.transactions[0]?.baseRev).toBe(4);
  await expect.poll(() => gameState(page).then((state) => state?.saved)).toBe('saved');

  await page.getByRole('button', { name: 'Undo' }).click({ force: true });
  await expect.poll(() => api.transactions.length).toBe(2);
  expect(api.transactions[1]?.label).toContain('Undo');

  if (testInfo.project.name === 'phone') {
    for (const name of ['Games', '▶ Play', '✎ Edit', 'Ask for a change']) {
      const box = await page.getByRole('button', { name, exact: true }).boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(64);
      expect(box?.height).toBeGreaterThanOrEqual(64);
    }
    await expect(page.getByLabel('Editor canvas')).toBeAttached();
    await expect(page.locator('[data-focus-zone="editor-inspector"]')).toBeAttached();
  }

  await page.getByRole('button', { name: /Play/ }).click({ force: true });
  const frame = gameFrame(page);
  await expect.poll(() => fixtureState(frame).then((state) => state.mode)).toBe('play');
});

test('replays one conflict and becomes read-only on lease loss', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'desktop covers protocol recovery; phone covers responsive acceptance');
  await installAuthRoutes(page, { signedIn: true });
  const api = await installGameApi(page);
  api.script('conflict', 'success');
  await page.goto('/g/game?mode=edit&test');
  await expect.poll(() => gameState(page).then((state) => state?.bridgeState), { timeout: 5_000 }).toBe('ready');

  await page.getByRole('button', { name: 'Skeleton' }).click({ force: true });
  const canvas = page.getByLabel('Editor canvas');
  await canvas.click({ force: true, position: { x: 160, y: 100 } });
  await expect.poll(() => api.attempts.length).toBe(2);
  expect(api.attempts.map(({ baseRev }) => baseRev)).toEqual([4, 9]);

  api.script('lease-lost');
  await canvas.click({ force: true, position: { x: 220, y: 140 } });
  await expect.poll(() => api.attempts.length).toBe(3);
  await expect.poll(() => gameState(page).then((state) => state?.readOnly)).toBe(true);
});

function gameState(page: Page): Promise<GameHook | undefined> {
  return page.evaluate(() => (window as Window & { __ogmHost?: { game?: GameHook } }).__ogmHost?.game);
}

function gameFrame(page: Page): Frame {
  const frame = page.frames().find((candidate) => candidate.url().startsWith('http://127.0.0.1:10001/g/'));
  if (!frame) throw new Error('cross-origin game frame was not mounted');
  return frame;
}

function fixtureState(frame: Frame): Promise<FixtureHook> {
  return frame.evaluate(() => (window as Window & { __fixture: FixtureHook }).__fixture);
}
