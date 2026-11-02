import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/* serves dist/ (written by `pnpm run check`) the way the static host does: /setup → setup/index.html */
const distDir = fileURLToPath(new URL('../dist', import.meta.url));
const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
let server: Server;
let origin: string;

test.beforeAll(async () => {
  server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? '/', 'http://x').pathname);
    const file = [join(distDir, path), join(distDir, path, 'index.html')].find(
      (candidate) => candidate.startsWith(distDir) && existsSync(candidate) && statSync(candidate).isFile(),
    );
    if (!file) return void response.writeHead(404).end();
    response.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    response.end(readFileSync(file));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

/* no network in tests: only the local server answers (the Google Fonts links are aborted) */
async function openSetup(page: Page, hash = ''): Promise<void> {
  await page.route(
    (url) => url.origin !== origin,
    (route) => route.abort(),
  );
  await page.goto(`${origin}/setup${hash}`);
}

const headers = 'h2 > button[aria-expanded][aria-controls]';

test('headers are buttons inside h2 that control existing, hidden panels', async ({ page }) => {
  await openSetup(page);
  const buttons = page.locator(headers);
  await expect(buttons).toHaveCount(8);
  for (const button of await buttons.all()) {
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    const panel = page.locator(`#${await button.getAttribute('aria-controls')}`);
    await expect(panel).toHaveCount(1);
    await expect(panel).toBeHidden();
    expect(await panel.evaluate((element) => (element as HTMLElement).hidden)).toBe(true);
  }
});

test('Enter and Space toggle a header and flip aria-expanded', async ({ page }) => {
  await openSetup(page);
  const button = page.locator('#step-2-button');
  const panel = page.locator('#step-2-panel');
  await button.focus();

  await page.keyboard.press('Enter');
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await expect(panel).toBeVisible();

  await page.keyboard.press('Space');
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(panel).toBeHidden();

  await page.keyboard.press('Space');
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await expect(panel).toBeVisible();
});

test('every checkbox has a label and every copy button an aria-label', async ({ page }) => {
  /* names are computed for what a user can reach, so open every step first (instantly: the animation is not under test) */
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openSetup(page);
  for (const button of await page.locator(headers).all()) await button.click();
  const boxes = await page.locator('input[type="checkbox"]').count();
  expect(boxes).toBeGreaterThan(0);
  await expect(page.getByRole('checkbox', { name: /\S/ })).toHaveCount(boxes);
  const copies = await page.locator('button.copy').count();
  expect(copies).toBeGreaterThan(boxes);
  await expect(page.locator('button.copy[aria-label]:not([aria-label=""])')).toHaveCount(copies);
});

test('Tab moves from an open header to its first copy button, then its checkbox', async ({ page }) => {
  await openSetup(page);
  const button = page.locator('#step-1-button');
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(button).toHaveAttribute('aria-expanded', 'true');

  await page.keyboard.press('Tab');
  await expect(page.locator('[data-substep="1.1"] button.copy')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('input.done[data-substep="1.1"]')).toBeFocused();
});

test('#step-3 deep link opens step 3 only', async ({ page }) => {
  await openSetup(page, '#step-3');
  await expect(page.locator('#step-3-button')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#step-3-panel')).toBeVisible();
  for (const other of [1, 2, 4, 5, 6, 7, 8]) await expect(page.locator(`#step-${other}-panel`)).toBeHidden();
});

test('a keyboard-focused header shows a visible focus ring at 375 px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openSetup(page);
  const button = page.locator('#step-1-button');
  await button.scrollIntoViewIfNeeded();
  const box = (await button.boundingBox())!;
  const clip = { x: 0, y: Math.max(0, box.y - 12), width: 375, height: box.height + 24 };
  const blurred = await page.screenshot({ clip, animations: 'disabled' });
  const scrollY = await page.evaluate(() => window.scrollY);

  /* reach the header by keyboard so :focus-visible applies, as it would for a keyboard user */
  for (let presses = 0; presses < 20 && !(await button.evaluate((el) => el === document.activeElement)); presses++) {
    await page.keyboard.press('Tab');
  }
  await expect(button).toBeFocused();
  expect(await button.evaluate((el) => el.matches(':focus-visible'))).toBe(true);
  const ring = await button.evaluate((el) => {
    const style = getComputedStyle(el);
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });
  expect(ring.style).not.toBe('none');
  expect(ring.width).toBeGreaterThan(0);

  /* the baseline is the same header unfocused, captured in this run: a ring that does not paint leaves them equal */
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
  const focused = await page.screenshot({ clip, animations: 'disabled' });
  expect(focused.equals(blurred)).toBe(false);
});
