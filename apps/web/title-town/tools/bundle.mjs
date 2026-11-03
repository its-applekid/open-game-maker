#!/usr/bin/env node
// One minified script for the town (city.js, the scenes, three.js and pixelfx), so a phone makes one request instead of
// a few hundred module fetches.   node tools/bundle.mjs <town dir>   (writes <town dir>/city.bundle.js)
import { createRequire } from 'module';
import { existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
const HERE = dirname(fileURLToPath(import.meta.url)), require = createRequire(resolve(HERE, '../../') + '/');
const esbuild = require('esbuild'), dir = resolve(process.argv[2]);
const three = { name: 'three', setup(b) {
  b.onResolve({ filter: /^three$/ }, () => ({ path: resolve(dir, 'vendor/three/build/three.module.js') }));
  b.onResolve({ filter: /^three\/addons\// }, a => ({ path: resolve(dir, 'vendor/three/examples/jsm', a.path.slice('three/addons/'.length)) }));
} };
const timeline = { name: 'timeline', setup(b) {
  b.onResolve({ filter: /^\.\/timeline\.js$/ }, () => {
    const local = resolve(dir, 'timeline.js');
    return { path: existsSync(local) ? local : resolve(HERE, '../timeline.js') };
  });
} };
await esbuild.build({ entryPoints: [resolve(dir, 'city.js')], bundle: true, format: 'esm', minify: true, target: 'es2022', outfile: resolve(dir, 'city.bundle.js'), plugins: [three, timeline], logLevel: 'warning' });
console.log('bundled', resolve(dir, 'city.bundle.js'));
