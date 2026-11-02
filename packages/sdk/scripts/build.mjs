import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

await build({
  absWorkingDir: packageRoot,
  entryPoints: {
    index: 'src/index.ts',
    'assets/index': 'src/assets/index.ts',
    'audio/index': 'src/audio/index.ts',
    'core/index': 'src/core/index.ts',
    'fx/index': 'src/fx/index.ts',
    'nav/index': 'src/nav/index.ts',
    'proc/index': 'src/proc/index.ts',
    'test/index': 'src/test/index.ts',
    'three/index': 'src/three/index.ts',
  },
  outdir: 'dist',
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  sourcemap: true,
  packages: 'external',
  alias: {
    pixelfx: resolve(packageRoot, '../../third_party/pixelfx/src'),
  },
  chunkNames: 'chunks/[name]-[hash]',
  logLevel: 'info',
});
