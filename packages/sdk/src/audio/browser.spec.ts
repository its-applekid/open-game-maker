import { expect, test } from '@playwright/test';

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
  await page.goto('/');
  await page.getByRole('button', { name: 'Unlock audio' }).click();
  await expect.poll(() => page.evaluate(() => window.__audio.status())).toBe('on');
  const started = Date.now();
  await expect(page.evaluate(() => window.__playNarration())).resolves.toEqual(['hello there little fox.']);
  expect(Date.now() - started).toBeLessThan(1_500);
});
