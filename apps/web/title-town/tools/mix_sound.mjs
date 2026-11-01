#!/usr/bin/env node
// superseded by gm run / gm shot / gm perf (OGM-090); kept for the town only
// Lay a scene's sound under a recording: reads the cue list the page exposes (window.__sounds, from the scene's timeline)
// and mixes the effects (models/sounds, tools/sounds.sh) at their times with ffmpeg. Serve the prototype first, as for
// capture.mjs.   node tools/mix_sound.mjs "<query>" <in.mp4> <out.mp4> [start seconds]
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
const HERE = dirname(fileURLToPath(import.meta.url)), require = createRequire(resolve(HERE, '../../') + '/');
const { chromium } = require('playwright');
const [query, vin, vout, start = '0'] = process.argv.slice(2), PORT = process.env.PORT || 8792, t0 = +start;
const b = await chromium.launch({ args: ['--use-angle=gl-egl', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 320, height: 180 } });
await p.goto(`http://localhost:${PORT}/index.html?capture&${query}`);
await p.waitForFunction(() => window.__ready, null, { timeout: 180000 });
const S = await p.evaluate(() => window.__sounds); await b.close();
const dur = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', vin]).toString();
const snd = n => resolve(HERE, '../models/sounds', n + '.mp3'), args = [], parts = [];
let i = 1;   // input 0 is the video
for (const c of S.cues) { const at = c.t - t0; if (at < 0 || at > dur) continue;
  args.push('-i', snd(c.s)); parts.push(`[${i++}]asetrate=48000*${c.r},aresample=48000,volume=${c.v},adelay=${Math.round(at * 1000)}:all=1[a${parts.length}]`); }
for (const l of S.loops) { const a = Math.max(0, l.t0 - t0), e = Math.min(dur, l.t1 - t0); if (e <= a) continue;
  args.push('-stream_loop', '-1', '-i', snd(l.s));
  parts.push(`[${i++}]atrim=0:${(e - a).toFixed(3)},afade=t=in:d=0.8,afade=t=out:st=${Math.max(0, e - a - .4).toFixed(3)}:d=0.4,volume=${l.v},adelay=${Math.round(a * 1000)}:all=1[a${parts.length}]`); }
const mix = parts.map((_, k) => `[a${k}]`).join('') + `amix=inputs=${parts.length}:normalize=0:duration=longest,alimiter=limit=.9,apad,atrim=0:${dur}[out]`;
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', vin, ...args, '-filter_complex', parts.join(';') + ';' + mix, '-map', '0:v', '-map', '[out]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-shortest', vout]);
console.log('wrote', vout, parts.length, 'sounds');
