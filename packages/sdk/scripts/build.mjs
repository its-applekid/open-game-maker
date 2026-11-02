import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

await build({
  absWorkingDir: packageRoot,
  entryPoints: {
    index: 'src/index.ts',
    'assets/index': 'src/assets/index.ts',
    'fx/index': 'src/fx/index.ts',
    'nav/index': 'src/nav/index.ts',
    'proc/index': 'src/proc/index.ts',
    'saves/index': 'src/saves/index.ts',
    'test/index': 'src/test/index.ts',
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
