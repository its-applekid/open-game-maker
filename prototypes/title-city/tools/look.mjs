#!/usr/bin/env node
// Close-ups of a moving thing without the one-frame camera lag: each time is drawn twice (__frame(t-.01) then __frame(t)) so a
// camera that follows scene state (?look=i, ?focus=) is in place before the screenshot; frames are tiled 4 per row.
//   node tools/look.mjs "<query>" <out.png> <t...>     W/H env for the viewport (default 640x400); serve the prototype first.
import { createRequire } from 'module'; import { execFileSync } from 'child_process';
const require = createRequire('/home/orangekid/games/open-game-maker-2000/prototypes/ui-v0/tools/');
const { chromium } = require('playwright');
const [q, out, ...ts] = process.argv.slice(2), W = +(process.env.W || 640), H = +(process.env.H || 400);
const b = await chromium.launch({ args: ['--use-angle=gl-egl', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: W, height: H } });
await p.goto('http://localhost:8792/index.html?' + q); await p.waitForFunction(() => window.__ready, null, { timeout: 300000 });
const files = [];
for (const [i, t] of ts.entries()) { await p.evaluate(t => { window.__frame(t - .01); window.__frame(t); }, +t); const f = out + '.f' + String(i).padStart(3, '0') + '.png'; await p.screenshot({ path: f }); files.push(f); }
await b.close();
const cols = Math.min(4, files.length), rows = Math.ceil(files.length / cols);
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', out + '.f%03d.png', '-vf', `tile=${cols}x${rows}`, '-frames:v', '1', out]);
for (const f of files) execFileSync('rm', [f]); console.log('wrote', out);
