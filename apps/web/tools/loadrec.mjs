// Record two phone-profile visits under 4x CPU throttling for frame review.
import { mkdir } from 'node:fs/promises';

import { chromium } from 'playwright';

const [output, url = 'http://127.0.0.1:43171/', seconds = '22'] = globalThis.process.argv.slice(2);
if (!output) throw new Error('usage: loadrec.mjs <out-dir> [url] [seconds]');

await mkdir(output, { recursive: true });

const software = globalThis.process.env.GM_VERIFY_SOFTWARE_GL === '1';
const browser = await chromium.launch({
  args: software ? ['--use-angle=swiftshader'] : ['--use-angle=gl-egl', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  recordVideo: { dir: output, size: { width: 390, height: 844 } },
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

const startedAt = Date.now();
const elapsed = () => ((Date.now() - startedAt) / 1000).toFixed(2);
const log = [];
page.on('console', (message) => log.push(`${elapsed()} console ${message.type()} ${message.text()}`));
page.on('pageerror', (error) => log.push(`${elapsed()} pageerror ${error.message}`));
await page.exposeBinding('__mark', (_source, value) => log.push(`${elapsed()} ${value}`));
await page.addInitScript(() =>
  globalThis.addEventListener('message', (event) => {
    if (typeof event.data === 'string') {
      globalThis.window.__mark(`msg ${event.data}`);
    }
  }),
);

await page.goto(url, { waitUntil: 'commit' });
log.push(`${elapsed()} committed`);
await page.waitForTimeout(Number(seconds) * 1000);
log.push(`${elapsed()} reload`);
await page.reload({ waitUntil: 'commit' });
await page.waitForTimeout(Number(seconds) * 1000);

await context.close();
await browser.close();
globalThis.console.log(log.join('\n'));
