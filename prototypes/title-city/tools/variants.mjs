#!/usr/bin/env node
// Make building variants from cloned models: node tools/variants.mjs (with the prototype served on PORT, default 8792).
// Sources are only read. Every variant is a new file in models/variants/ and gets a manifest entry saying what it was made
// from and how, so it can be rebuilt or traced back. Never point this at a source folder.
import { createRequire } from 'module';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(resolve(dirname(fileURLToPath(import.meta.url)), '../../ui-v0/tools') + '/');
const { chromium } = require('playwright');

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), '..'), OUT = join(HERE, 'models/variants'), PORT = process.env.PORT || 8792;
const L = s => s.split(' ');
const TOWERS = L('a b c d e').map(x => 'city/building-skyscraper-' + x), MIDS = L('a b c d f g h l m').map(x => 'city/building-' + x);
const specs = [];
// towers: two taller versions (middle floors repeated) and a shorter one (middle removed)
for (const f of TOWERS) {
  const n = f.split('-').pop();
  specs.push({ name: `skyscraper-${n}-tall`, set: 'tall', op: 'stack', from: [f], mid: 3 });
  specs.push({ name: `skyscraper-${n}-taller`, set: 'tall', op: 'stack', from: [f], mid: 5 });
  specs.push({ name: `skyscraper-${n}-short`, set: 'mid', op: 'stack', from: [f], mid: 0 });
}
// mid-rise blocks: one and two extra bands
for (const f of MIDS) {
  const n = f.split('-').pop();
  specs.push({ name: `building-${n}-plus1`, set: 'mid', op: 'stack', from: [f], mid: 2 });
  specs.push({ name: `building-${n}-plus2`, set: 'tall', op: 'stack', from: [f], mid: 3 });
}
// towers on wide podiums
for (const [i, f] of TOWERS.entries()) for (const base of ['city/building-e', 'city/building-k']) {
  specs.push({ name: `podium-${base.split('-').pop()}-${f.split('-').pop()}`, set: 'tall', op: 'podium', from: [base, f], scale: .7 + (i % 2) * .08 });
}

mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-angle=gl-egl', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage();
p.on('pageerror', e => console.error('pageerror', e.message));
await p.goto(`http://localhost:${PORT}/tools/variants.html`);
await p.waitForFunction(() => window.ready, null, { timeout: 60000 });
const manifest = { note: 'Variants made by tools/variants.mjs from cloned Kenney models (CC0). Sources are never modified.', made: new Date().toISOString().slice(0, 10), variants: [] };
for (const s of specs) {
  const file = join(OUT, s.name + '.glb');
  if (s.from.some(f => resolve(HERE, 'models', f + '.glb') === file)) throw new Error('refusing to overwrite a source: ' + file);
  const r = await p.evaluate(spec => window.make(spec), s);
  writeFileSync(file, Buffer.from(r.glb, 'base64'));
  manifest.variants.push({ ...s, size: r.size });
  console.log(s.name.padEnd(28), s.op, s.from.join(' + '), r.size.join('x'));
}
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
await b.close();
console.log(`${specs.length} variants in ${OUT}`);
