import { expect, test } from '@playwright/test';

import { startFakeVoiceServer } from './fake-voice-server.mjs';

let server: Awaited<ReturnType<typeof startFakeVoiceServer>>;

test.beforeAll(async () => {
  server = await startFakeVoiceServer();
});

test.afterAll(async () => {
  await server.close();
});

async function stats() {
  const response = await fetch(`${server.url}/stats`);
  return (await response.json()) as {
    audioBytes: number[];
    receivedTypes: string[];
    confirmedDrafts: string[];
  };
}

test('streams 16 kHz PCM, plays and interrupts audio, and confirms a draft', async ({ page }) => {
  await page.goto(`${server.url}/e2e/page.html?token=good`);
  await page.getByRole('button', { name: 'Start voice' }).click();

  await expect.poll(async () => (await stats()).audioBytes.length).toBeGreaterThanOrEqual(5);
  const audioBytes = (await stats()).audioBytes.slice(0, 5);
  expect(audioBytes.every((bytes) => bytes >= 3_100 && bytes <= 3_300)).toBe(true);

  await expect(page.getByLabel('Builder captions')).toHaveText('I made a draft.');
  await expect(page.getByRole('button', { name: 'Confirm' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__ogm.playbackStarts)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.__ogm.playbackTime > window.__ogm.playbackStartedAt)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__ogm.playbackStops)).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect.poll(async () => (await stats()).confirmedDrafts).toContain('draft-1');
});

test('surfaces a 4401 close as unauthorized', async ({ page }) => {
  await page.goto(`${server.url}/e2e/page.html?token=bad`);
  await page.getByRole('button', { name: 'Start voice' }).click();

  await expect.poll(() => page.evaluate(() => window.__ogm.errors)).toContain('unauthorized');
});

declare global {
  interface Window {
    __ogm: {
      errors: string[];
      playbackStarts: number;
      playbackStops: number;
      playbackStartedAt: number;
      playbackTime: number;
    };
  }
}
