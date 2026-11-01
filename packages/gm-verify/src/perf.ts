import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Tier } from '@ogm/contracts';
import { devices, type Browser, type Response } from 'playwright';

import { gameUrl, READY_TIMEOUT_MS } from './browser.js';
import type { PerfResult } from './report.js';

export const DEVICE_ALIASES: Record<string, string> = { iphone13: 'iPhone 13' };

export type PerfOptions = { device?: string; cpu?: number; tier?: Tier; recordDir?: string; readyTimeoutMs?: number };

/** weight.mjs grouping, by URL path and extension. */
export function resourceType(url: string): string {
  const path = new URL(url).pathname.toLowerCase();
  if (/\/models?\/|\.(glb|gltf|obj|fbx|bin)$/.test(path)) return 'models';
  if (/\/audio\/|\.(mp3|ogg|wav|m4a|opus)$/.test(path)) return 'audio';
  if (/\/(img|images|textures)\/|\.(png|jpe?g|webp|gif|svg|ktx2|avif)$/.test(path)) return 'images';
  if (/fonts?\/|\.(woff2?|ttf|otf)$/.test(path)) return 'fonts';
  if (/\.(m?js|css|html?|wasm|json|map)$/.test(path) || path.endsWith('/')) return 'code';
  return 'other';
}

/**
 * loadtime.mjs: the phone profile with the CPU slowed `cpu`x, a first load then a reload, each timed to
 * `window.__gm.ready`, counting responses from the network vs the service worker. With `recordDir`, also writes the
 * load video and a timestamped `load.log` (loadrec.mjs).
 */
export async function measureLoad(browser: Browser, url: string, options: PerfOptions = {}): Promise<PerfResult> {
  const deviceName = DEVICE_ALIASES[options.device ?? 'iphone13'] ?? options.device ?? 'iPhone 13';
  const device = devices[deviceName];
  if (!device) throw new Error(`unknown device "${options.device}"`);
  const cpu = options.cpu ?? 4;
  if (options.recordDir) mkdirSync(options.recordDir, { recursive: true });
  const context = await browser.newContext({
    ...device,
    ...(options.recordDir ? { recordVideo: { dir: options.recordDir, size: device.viewport } } : {}),
  });
  const page = await context.newPage();
  const t0 = Date.now();
  const log: string[] = [];
  const stamp = (line: string) => log.push(`${((Date.now() - t0) / 1000).toFixed(2)} ${line}`);
  page.on('pageerror', (error) => stamp(`pageerror ${error.message}`));
  try {
    await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: cpu });
    const target = gameUrl(url, options.tier ?? 'mobile');
    const timed: Record<'first' | 'cached', { ms: number; net: number; sw: number }> = {
      first: { ms: 0, net: 0, sw: 0 },
      cached: { ms: 0, net: 0, sw: 0 },
    };
    let bytesByType: PerfResult['bytesByType'] = {};
    for (const run of ['first', 'cached'] as const) {
      const counts = timed[run];
      const onResponse = (response: Response) => {
        if (!response.url().startsWith('http')) return;
        if (response.fromServiceWorker()) counts.sw += 1;
        else counts.net += 1;
      };
      page.on('response', onResponse);
      const start = Date.now();
      stamp(`${run} start`);
      await (run === 'first' ? page.goto(target) : page.reload());
      await page.waitForFunction(
        () => {
          const w = window as unknown as { __gm?: { ready?: boolean }; __ready?: boolean };
          return w.__gm?.ready === true || w.__ready === true;
        },
        null,
        { timeout: options.readyTimeoutMs ?? READY_TIMEOUT_MS, polling: 100 },
      );
      counts.ms = Date.now() - start;
      stamp(`${run} ready`);
      page.off('response', onResponse);
      if (run === 'first') {
        const entries = await page.evaluate(() =>
          [
            ...performance.getEntriesByType('navigation'),
            ...performance.getEntriesByType('resource'),
          ].map((entry) => {
            const timing = entry as PerformanceResourceTiming;
            return { name: timing.name, bytes: timing.encodedBodySize || timing.transferSize || 0 };
          }),
        );
        bytesByType = {};
        for (const entry of entries) {
          if (!entry.name.startsWith('http')) continue;
          const type = resourceType(entry.name);
          bytesByType[type] ??= { n: 0, bytes: 0 };
          bytesByType[type].n += 1;
          bytesByType[type].bytes += entry.bytes;
        }
      }
    }
    return {
      device: deviceName,
      cpu,
      firstMs: timed.first.ms,
      cachedMs: timed.cached.ms,
      fromNetwork: timed.first.net,
      fromCache: timed.cached.sw,
      bytesByType,
    };
  } finally {
    await context.close();
    if (options.recordDir) writeFileSync(join(options.recordDir, 'load.log'), `${log.join('\n')}\n`);
  }
}

export function totalBytes(perf: PerfResult): number {
  return Object.values(perf.bytesByType).reduce((sum, group) => sum + group.bytes, 0);
}
