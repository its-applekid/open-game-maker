import { mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const packageRoot = fileURLToPath(new URL('../../..', import.meta.url));
const fixtureRoot = fileURLToPath(new URL('.', import.meta.url));
const outdir = `${packageRoot}/dist/audio-fixture`;

await mkdir(outdir, { recursive: true });
await build({
  absWorkingDir: packageRoot,
  entryPoints: ['src/audio/fixture/index.ts'],
  entryNames: 'main',
  chunkNames: 'chunks/[name]-[hash]',
  outdir,
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  logLevel: 'info',
});
await Promise.all(
  ['index.html', 'sine.mp3', 'song.example.json'].map((name) =>
    copyFile(`${fixtureRoot}/${name}`, `${outdir}/${name}`),
  ),
);
