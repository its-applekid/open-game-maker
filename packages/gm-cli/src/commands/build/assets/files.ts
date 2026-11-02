import { createHash, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { lstat, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';

import { UsageError } from '../../../command.js';

export function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function slugFromId(id: string): string {
  const withoutVersion = id.replace(/@[^/@]+$/, '');
  const leaf = withoutVersion.slice(withoutVersion.lastIndexOf('/') + 1).replace(/^t[123]:/, '');
  return (
    leaf
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'asset'
  );
}

export function outputName(bytes: Uint8Array, extension: string): string {
  return `${sha256(bytes)}.${extension}`;
}

export function resolveOutputDir(cwd: string, value: string): string {
  if (isAbsolute(value)) throw new UsageError('--out must be relative to the game repo', 'gm build assets');
  const segments = value.replaceAll('\\', '/').split('/');
  if (segments.some((segment) => segment === '..' || segment === '.gm' || segment === 'node_modules')) {
    throw new UsageError('--out must stay outside .gm and node_modules', 'gm build assets --out public/a');
  }
  const root = resolve(cwd);
  const target = resolve(cwd, value);
  if (target === root || !target.startsWith(`${root}${sep}`)) {
    throw new UsageError('--out must be a directory inside the game repo', 'gm build assets --out public/a');
  }
  return target;
}

export function generatedPath(root: string, name: string): string {
  if (!name || basename(name) !== name || name.includes('/') || name.includes('\\')) {
    throw new Error(`invalid generated file name: ${name}`);
  }
  return join(root, name);
}

export async function assertNoSymlinks(root: string, target: string): Promise<void> {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(target);
  const relativeTarget = relative(resolvedRoot, resolvedTarget);
  if (relativeTarget === '..' || relativeTarget.startsWith(`..${sep}`) || isAbsolute(relativeTarget)) {
    throw new UsageError('asset build path escapes the game repo', 'gm build assets --out public/a');
  }
  let current = resolvedRoot;
  for (const segment of relativeTarget.split(sep).filter(Boolean)) {
    current = join(current, segment);
    try {
      if ((await lstat(current)).isSymbolicLink()) {
        throw new UsageError(
          `asset build path contains a symbolic link: ${relative(resolvedRoot, current)}`,
          'replace the symbolic link with a directory or file inside the game repo',
        );
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
  }
}

export async function executableExists(command: string): Promise<boolean> {
  try {
    await promisify(execFile)(command, ['--version'], { timeout: 5_000 });
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ENOENT';
  }
}

export async function writeIfChanged(
  path: string,
  content: Uint8Array | string,
  containmentRoot?: string,
): Promise<boolean> {
  if (containmentRoot) await assertNoSymlinks(containmentRoot, path);
  const bytes = typeof content === 'string' ? Buffer.from(content) : Buffer.from(content);
  try {
    if ((await readFile(path)).equals(bytes)) return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await mkdir(dirname(path), { recursive: true });
  const temporary = resolve(dirname(path), `.${basename(path)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`);
  try {
    const handle = await open(temporary, 'wx');
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
  return true;
}
