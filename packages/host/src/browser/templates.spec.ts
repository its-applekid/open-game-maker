import { expect, test } from '@playwright/test';

for (const template of [
  { id: 'game-2d', manifestId: 'game-2d' },
  { id: 'game-3d', manifestId: 'game-3d' },
]) {
  test(`${template.id} reaches ready through the cross-origin host frame`, async ({ page }) => {
    test.setTimeout(90_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    await page.goto(`/?template=${template.id}`);

    try {
      await expect
        .poll(() => page.evaluate(() => window.__host.ready[0]?.id), { timeout: 60_000 })
        .toBe(template.manifestId);
    } catch (error) {
      const gameFrame = page.frames().find((frame) => frame.url().includes(`/g/${template.id}/`));
      const stage = gameFrame
        ? await gameFrame.evaluate(() => document.documentElement.dataset.bootStage ?? 'unknown')
        : 'missing';
      throw new Error(`template boot stopped at ${stage}; page errors: ${pageErrors.join(' | ')}`, { cause: error });
    }
    expect(page.frames().some((frame) => frame.url().startsWith(`http://127.0.0.1:4174/g/${template.id}/`))).toBe(true);
    expect(await page.evaluate(() => window.__host.errors)).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
}
