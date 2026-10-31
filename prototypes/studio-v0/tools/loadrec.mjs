// Record a phone-profile load of the studio title (CPU 4x slower), first visit then a reload, logging page messages
// (town-ready) with times. Review the video every other frame:  node loadrec.mjs <out-dir> [url] [seconds per visit]
// ffmpeg -ss <t> -t 3 -i <out>/*.webm -vf "fps=12.5,scale=156:-2,tile=10x4" -frames:v 1 sheet.png
// Test locally WITHOUT isMobile if the page lacks a viewport meta (deploy.sh adds it): Chromium lays it out 980 px wide.
import { createRequire } from 'module'; const require = createRequire('/home/orangekid/games/open-game-maker-2000/prototypes/ui-v0/tools/'); const { chromium } = require('playwright');
const [O, URL = 'http://localhost:8793/index.html', SECS = '22'] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-angle=gl-egl', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, recordVideo: { dir: O, size: { width: 390, height: 844 } } });
const p = await ctx.newPage(), cdp = await ctx.newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
const t0 = Date.now(), T = () => ((Date.now() - t0) / 1000).toFixed(2), log = [];
p.on('pageerror', e => log.push(T() + ' pageerror ' + e.message));
await p.exposeBinding('__mark', (_, s) => log.push(T() + ' ' + s));
await p.addInitScript(() => addEventListener('message', e => { if (typeof e.data === 'string') window.__mark('msg ' + e.data); }));
await p.goto(URL, { waitUntil: 'commit' }); log.push(T() + ' committed'); await p.waitForTimeout(+SECS * 1000);
log.push(T() + ' reload'); await p.reload({ waitUntil: 'commit' }); await p.waitForTimeout(+SECS * 1000);
await ctx.close(); await b.close(); console.log(log.join('\n'));
