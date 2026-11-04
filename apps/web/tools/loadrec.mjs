// Record a phone-profile visit under 4x CPU throttling until the title town is ready.
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

import { chromium } from 'playwright';

export function loadWindowMilliseconds(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error('load window must be a positive number of seconds');
  }
  return seconds * 1000;
}

export function createTownReadyGate() {
  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });

  return {
    mark(value) {
      if (value === 'msg town-ready') resolveReady();
    },
    async wait(milliseconds, sleep = delay) {
      const controller = new globalThis.AbortController();
      try {
        await Promise.race([ready, sleep(milliseconds, undefined, { signal: controller.signal })]);
      } finally {
        controller.abort();
      }
    },
  };
}

export function formatHttpError(response) {
  if (response.ok()) return undefined;
  return `http ${response.status()} ${response.url()}`;
}

export async function recordLoad([output, url = 'http://127.0.0.1:43171/', seconds = '60']) {
  if (!output) throw new Error('usage: loadrec.mjs <out-dir> [url] [seconds]');
  const loadMilliseconds = loadWindowMilliseconds(seconds);
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
  const townReady = createTownReadyGate();
  page.on('console', (message) => log.push(`${elapsed()} console ${message.type()} ${message.text()}`));
  page.on('pageerror', (error) => log.push(`${elapsed()} pageerror ${error.message}`));
  page.on('response', (response) => {
    const error = formatHttpError(response);
    if (error) log.push(`${elapsed()} ${error}`);
  });
  await page.exposeBinding('__mark', (_source, value) => {
    const mark = String(value);
    log.push(`${elapsed()} ${mark}`);
    townReady.mark(mark);
  });
  await page.addInitScript(() =>
    globalThis.addEventListener('message', (event) => {
      if (typeof event.data === 'string') {
        globalThis.window.__mark(`msg ${event.data}`);
      }
    }),
  );

  await page.goto(url, { waitUntil: 'commit' });
  log.push(`${elapsed()} committed`);
  await townReady.wait(loadMilliseconds);

  await context.close();
  await browser.close();
  globalThis.console.log(log.join('\n'));
}

if (globalThis.process.argv[1] && import.meta.url === pathToFileURL(globalThis.process.argv[1]).href) {
  await recordLoad(globalThis.process.argv.slice(2));
}
