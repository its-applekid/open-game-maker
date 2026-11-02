import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

const alignment = JSON.parse(readFileSync(new URL('./fixture/hello.alignment.json', import.meta.url), 'utf8')) as {
  duration_ms: number;
  alignment: { end_ms: number }[];
};

test('unlocks after a pointerup gesture', async ({ page }) => {
  await page.goto('/audio/');
  await page.getByRole('button', { name: 'Unlock audio' }).click();
  await expect.poll(() => page.evaluate(() => window.__audio.status())).toBe('on');
});

test('renders the sine cue at its source peak and RMS levels', async ({ page }) => {
  await page.goto('/audio/');
  const metrics = await page.evaluate(() => window.__audio.renderCue('sine'));
  expect(metrics.peakDb).toBeGreaterThan(-4);
  expect(metrics.peakDb).toBeLessThan(-2);
  expect(metrics.rmsDb - metrics.peakDb).toBeCloseTo(-3.01, 1);
});

test('loads the optional Tone chunk only when song is called', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/audio/');
  const chunksBeforeSong = requests.filter((url) => url.includes('/chunks/'));

  await page.evaluate(async () => {
    const song = await fetch('/audio/song.example.json').then((response) => response.json());
    const handle = await window.__audio.song(song);
    handle.stop();
  });

  expect(requests.filter((url) => url.includes('/chunks/')).length).toBeGreaterThan(chunksBeforeSong.length);
});

test('plays SpokenText through the unlocked voice bus', async ({ page }) => {
  await page.goto('/audio/');
  await page.getByRole('button', { name: 'Unlock audio' }).click();
  await expect.poll(() => page.evaluate(() => window.__audio.status())).toBe('on');
  const { sentences, audioMs } = await page.evaluate(() => window.__playNarration());
  expect(sentences).toEqual(['hello there little fox.']);
  // Measured on the AudioContext clock from the first sentence: a loaded host stretches wall time, not the audio.
  expect(audioMs).toBeGreaterThanOrEqual(alignment.alignment.at(-1)!.end_ms - 50);
  expect(audioMs).toBeLessThanOrEqual(alignment.duration_ms + 500);
});
