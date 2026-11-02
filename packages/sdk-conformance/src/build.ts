import { spawn } from 'node:child_process';
import { copyFile, mkdir, readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import type { BuildKind } from './types.js';

export const BUILD_KINDS: BuildKind[] = ['test', 'published'];
/** A stalled build would otherwise hold the host-wide capture slot forever. */
export const BUILD_TIMEOUT_MS = 300_000;

function run(command: string, args: string[], cwd: string, env: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line no-restricted-properties -- the child inherits the caller's whole environment (PATH, pnpm)
    const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    const output: string[] = [];
    child.stdout.on('data', (chunk: Buffer) => output.push(chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => output.push(chunk.toString()));
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${command} ${args.join(' ')} timed out after ${BUILD_TIMEOUT_MS} ms`));
    }, BUILD_TIMEOUT_MS);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited ${code}: ${output.join('').slice(-800)}`));
    });
  });
}

/**
 * Builds the game once per kind with the OGM-022 build-kind flag: Vite `--mode <kind>` and
 * `GM_BUILD=<kind>` (the templates read one or the other into `__GM_BUILD__`). Each build's
 * `index.html` is also placed at `/g/conf/<kind>/index.html`, the path `@gm/host` frames.
 */
export async function buildKinds(gameDir: string, outDir: string): Promise<Record<BuildKind, string>> {
  const dirs = {} as Record<BuildKind, string>;
  for (const kind of BUILD_KINDS) {
    const dir = join(outDir, `build-${kind}`);
    await run('pnpm', ['exec', 'vite', 'build', '--mode', kind, '--outDir', dir, '--emptyOutDir'], gameDir, {
      GM_BUILD: kind,
    });
    await mkdir(join(dir, 'g/conf', kind), { recursive: true });
    await copyFile(join(dir, 'index.html'), join(dir, 'g/conf', kind, 'index.html'));
    dirs[kind] = dir;
  }
  return dirs;
}

/** Every `.js`/`.mjs` file under `dir`, for C8's grep. */
export async function readBundle(dir: string): Promise<{ path: string; text: string }[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && /\.m?js$/.test(entry.name));
  return Promise.all(
    files.map(async (entry) => {
      const path = join(entry.parentPath, entry.name);
      return { path: relative(dir, path), text: await readFile(path, 'utf8') };
    }),
  );
}
