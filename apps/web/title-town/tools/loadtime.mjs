#!/usr/bin/env node
// superseded by gm run / gm shot / gm perf (OGM-090); kept for the town only
// How long a page takes to show on a phone-class device: iPhone 13 profile, CPU slowed 4x (override with a second
// argument), then a reload to see what the local cache (sw.js) saves. Waits for the studio's town (.t-scene.on) or a
// page's window.__ready.   node tools/loadtime.mjs <url> [cpu slowdown]
import { createRequire } from 'module';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(resolve(dirname(fileURLToPath(import.meta.url)), '../../') + '/');
const { chromium, devices } = require('playwright');
const [url, rate = 4] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-angle=gl-egl', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ ...devices['iPhone 13'] }), p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message));
await (await ctx.newCDPSession(p)).send('Emulation.setCPUThrottlingRate', { rate: +rate });
for (const run of ['first', 'cached']) {
  let net = 0, sw = 0; const on = r => { if (!r.url().startsWith('http')) return; r.fromServiceWorker() ? sw++ : net++; }; p.on('response', on);
  const t0 = Date.now(); await (run === 'first' ? p.goto(url) : p.reload());
  await p.waitForFunction(() => document.querySelector('.t-scene.on') || window.__ready, null, { timeout: 300000, polling: 200 });
  console.log(`${run}: shown after ${(Date.now() - t0) / 1000} s; ${net} from the network, ${sw} from the local cache`);
  p.off('response', on); await p.waitForTimeout(3000);
}
console.log(errs.slice(0, 3).join(' ; ') || 'no page errors'); await b.close();
