#!/usr/bin/env node
// Check the Easter egg's tap targets: at scene time t, scan a grid of screen points through window.__tap (which counts
// as a hit?), then reload, tap the highest and lowest hit and screenshot the bursts with the tapped spots marked (green,
// cyan). A tap well off the enemy must not count, and each burst must sit where the finger was.
// Serve the prototype first, as for capture.mjs.   node tools/taptest.mjs <out-dir> <t> [<t>...]   (e.g. 9 kaiju, 50 saucer)
import { createRequire } from 'module';
import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(resolve(dirname(fileURLToPath(import.meta.url)), '../../ui-v0/tools') + '/');
const { chromium } = require('playwright');
const [out, ...ts] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const URL = `http://localhost:${process.env.PORT || 8792}/index.html?capture&cam=menu&scene=all`;
const b = await chromium.launch({ args: ['--use-angle=gl-egl', '--enable-gpu', '--ignore-gpu-blocklist'] });
for (const t of ts.map(Number)) {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } }), ready = () => p.waitForFunction(() => window.__ready, null, { timeout: 300000 });
  await p.goto(URL); await ready();
  const pts = await p.evaluate(t => { __frame(t); const h = []; for (let y = .02; y < 1; y += .02) for (let x = .02; x < 1; x += .02) if (__tap(x, y)) h.push([+x.toFixed(2), +y.toFixed(2)]); return h; }, t);
  if (!pts.length) { console.log(`t=${t}: no hits`); await p.close(); continue; }
  const a = pts.reduce((m, q) => q[1] < m[1] ? q : m), c = pts.reduce((m, q) => q[1] > m[1] ? q : m);
  await p.reload(); await ready();   // the scan's taps changed the scene; start clean
  await p.evaluate(([t, a, c]) => { __frame(t); __tap(...a); __tap(...c); __frame(t + .12);
    for (const [q, col] of [[a, 'lime'], [c, 'cyan']]) { const e = document.createElement('div'); e.style.cssText = `position:fixed;left:${q[0] * 100}%;top:${q[1] * 100}%;width:10px;height:10px;margin:-5px;border-radius:50%;background:${col};z-index:9`; document.body.appendChild(e); } }, [t, a, c]);
  await p.screenshot({ path: `${out}/tap-t${t}.png` }); await p.close();
  console.log(`t=${t}: ${pts.length} grid points hit; highest ${a}, lowest ${c} -> ${out}/tap-t${t}.png`);
}
await b.close();
