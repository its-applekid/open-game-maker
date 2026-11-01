#!/usr/bin/env node
// Bake the parts of the town that come out the same every time, so a phone doesn't work them out on every load:
// the terrain's heights and face colours -> models/bake/terrain.bin, the forest's trees -> models/bake/trees.bin (read by
// terrain() and trees() in city.js), and every model the town and its scenes use, processed and quantised ->
// models/bake/models.bin.gz (loadPack() in city.js). Rerun after changing the terrain, the river, the town's shape or the ground colours. Serve the prototype first, as for capture.mjs.
import { createRequire } from 'module';
import { mkdirSync, writeFileSync } from 'fs';
import { gzipSync } from 'zlib';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
const HERE = dirname(fileURLToPath(import.meta.url)), require = createRequire(resolve(HERE, '../../') + '/');
const { chromium } = require('playwright');
const b = await chromium.launch({ args: ['--use-angle=gl-egl', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 320, height: 180 } });
await p.goto(`http://localhost:${process.env.PORT || 8792}/index.html?capture&nobake&cam=menu&scene=all`);   // the scenes too, so their models are packed
await p.waitForFunction(() => window.__ready, null, { timeout: 300000 });
const grab = name => p.evaluate(n => { const v = window[n](), u = new Uint8Array(v.buffer, v.byteOffset, v.byteLength); let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode(...u.subarray(i, i + 32768)); return btoa(s); }, name);
const models = Buffer.from(await p.evaluate(async () => { const u = await window.__modelsBake(); let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode(...u.subarray(i, i + 32768)); return btoa(s); }), 'base64');
const files = { 'terrain.bin': Buffer.from(await grab('__terrainBake'), 'base64'), 'trees.bin': Buffer.from(await grab('__treesBake'), 'base64'), 'models.bin.gz': gzipSync(models, { level: 9 }) };
await b.close();
const out = resolve(HERE, '../models/bake'); mkdirSync(out, { recursive: true });
for (const [n, bytes] of Object.entries(files)) { writeFileSync(`${out}/${n}`, bytes); console.log('wrote models/bake/' + n, (bytes.length / 1e6).toFixed(2), 'MB'); }
