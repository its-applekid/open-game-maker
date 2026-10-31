#!/usr/bin/env node
// The looping poster the studio menu shows while the town loads: the menu view exactly as it first appears (before the
// scenes join), a few seconds of drifting clouds and boats, the end cross-faded into the start so it loops without a seam.
// Writes models/bake/poster-portrait.webp and poster-landscape.webp (animated WebP: GIF-like, far smaller, full colour).
// Serve the prototype first, as for capture.mjs.   node tools/poster.mjs
import { createRequire } from 'module';
import { mkdirSync, rmSync } from 'fs';
import { execFileSync } from 'child_process';
import { dirname, resolve, join } from 'path';
import { fileURLToPath } from 'url';
const HERE = dirname(fileURLToPath(import.meta.url)), require = createRequire(resolve(HERE, '../../ui-v0/tools') + '/');
const { chromium } = require('playwright');
const PY = resolve(HERE, '../../../scripts/audio/.venv/bin/python'), OUT = resolve(HERE, '../models/bake'), FPS = 12, L = 4, X = .8;   // loop seconds, cross-fade seconds
const b = await chromium.launch({ args: ['--use-angle=gl-egl', '--enable-gpu', '--ignore-gpu-blocklist'] });
// each at the widest shape of its orientation: the camera keeps its vertical view, so cropping the sides (object-fit: cover) on
// a narrower screen gives exactly the live framing
for (const [name, w, h] of [['portrait', 1000, 1010], ['landscape', 1728, 720]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } }), tmp = join(OUT, '.poster-' + name); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  await p.goto(`http://localhost:${process.env.PORT || 8792}/index.html?capture&cam=menu&scene=all&noscenes`);
  await p.waitForFunction(() => window.__ready, null, { timeout: 300000 });
  for (let i = 0; i < Math.round((L + X) * FPS); i++) { await p.evaluate(t => window.__frame(t), i / FPS); await p.screenshot({ path: join(tmp, `f${String(i).padStart(3, '0')}.png`) }); }
  await p.close();
  // blend the tail into the head: frame i (i < X*FPS) becomes a mix of frame L*FPS+i and frame i, so the last frame leads into the first
  execFileSync(PY, ['-I', '-c', `import sys, glob
from PIL import Image
d, n, x = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
for i in range(x):
    a = Image.open(f'{d}/f{n + i:03d}.png').convert('RGB'); c = Image.open(f'{d}/f{i:03d}.png').convert('RGB')
    Image.blend(a, c, i / x).save(f'{d}/f{i:03d}.png')`, tmp, String(L * FPS), String(Math.round(X * FPS))]);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', join(tmp, 'f%03d.png'), '-frames:v', String(L * FPS), '-c:v', 'libwebp_anim', '-loop', '0', '-quality', '62', '-compression_level', '6', join(OUT, `poster-${name}.webp`)]);
  rmSync(tmp, { recursive: true, force: true }); console.log('wrote', `models/bake/poster-${name}.webp`);
}
await b.close();
