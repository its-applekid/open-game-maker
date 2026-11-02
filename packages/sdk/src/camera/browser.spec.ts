import type { ViewId } from '@ogm/contracts';
import { expect, test } from '@playwright/test';

const views: ViewId[] = ['iso', 'topdown', 'side', 'follow', 'fps', 'orbit', 'fixed'];

for (const view of views) {
  test(`${view} renders, projects the player, and replays deterministically`, async ({ page }) => {
    await page.goto(`/camera/?view=${view}`);
    await expect.poll(() => page.evaluate(() => window.__camera.ready)).toBe(true);
    const result = await page.evaluate(() => {
      const screen = window.__camera.playerScreen();
      if (!screen) return { calls: 0, hit: false, first: '', second: '', backend: '' };
      window.__camera.renderAt(1000);
      const first = window.__camera.renderGameToText();
      window.__camera.renderAt(1000);
      const second = window.__camera.renderGameToText();
      const info = window.__camera.renderInfo();
      return { ...info, hit: window.__camera.hitTest(screen.x, screen.y), first, second };
    });

    expect(result.calls).toBeGreaterThan(0);
    expect(result.hit).toBe(true);
    expect(result.first).toBe(result.second);
    expect(result.backend).not.toBe('');
  });
}

test('iso cuts away the tagged wall between the camera and player', async ({ page }) => {
  await page.goto('/camera/?view=iso');
  await expect.poll(() => page.evaluate(() => window.__camera.probes().cutaway)).toBeCloseTo(0.28);
});

declare global {
  interface Window {
    __camera: {
      ready: boolean;
      hitTest(x: number, y: number): boolean;
      playerScreen(): { x: number; y: number } | null;
      probes(): { cutaway: number };
      renderAt(ms: number): void;
      renderGameToText(): string;
      renderInfo(): { calls: number; backend: string };
    };
  }
}
