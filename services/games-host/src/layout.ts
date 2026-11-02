import { randomUUID } from 'node:crypto';
import { open, realpath, rename, rm, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import { pid } from 'node:process';

// Build ids are stable ids (`build_` + uppercase Crockford), so uppercase is allowed.
export const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u;

export class BadId extends Error {
  constructor(id: string) {
    super(`invalid game or build id: ${id}`);
    this.name = 'BadId';
  }
}

export function buildDir(root: string, gameId: string, buildId: string): string {
  if (!ID_RE.test(gameId)) {
    throw new BadId(gameId);
  }
  if (!ID_RE.test(buildId)) {
    throw new BadId(buildId);
  }

  return join(root, gameId, buildId);
}

export async function resolveFile(directory: string, urlPath: string): Promise<string | null> {
  const decodedPath = decodeUrlPath(urlPath);
  if (decodedPath === null) {
    return null;
  }

  let segments: string[];
  if (decodedPath === '' || decodedPath === '/') {
    segments = ['index.html'];
  } else {
    if (decodedPath.startsWith('/')) {
      return null;
    }

    segments = decodedPath.split('/');
    if (decodedPath.endsWith('/')) {
      segments[segments.length - 1] = 'index.html';
    }
  }

  if (segments.some(isUnsafeSegment)) {
    return null;
  }

  try {
    const realDirectory = await realpath(directory);
    const candidate = await realpath(join(realDirectory, ...segments));
    const relativePath = relative(realDirectory, candidate);
    if (
      relativePath === '' ||
      isAbsolute(relativePath) ||
      relativePath === '..' ||
      relativePath.startsWith(`..${sep}`)
    ) {
      return null;
    }
    return candidate;
  } catch {
    return null;
  }
}

export async function isComplete(directory: string): Promise<boolean> {
  try {
    return (await stat(join(directory, '.complete'))).isFile();
  } catch {
    return false;
  }
}

export async function markComplete(directory: string): Promise<void> {
  await syncDirectory(directory);

  const marker = join(directory, '.complete');
  const temporaryMarker = join(directory, `.complete.${pid}.${randomUUID()}.tmp`);
  try {
    const handle = await open(temporaryMarker, 'wx');
    try {
      await handle.writeFile(`${new Date().toISOString()}\n`, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }

    await rename(temporaryMarker, marker);
    await syncDirectory(directory);
  } finally {
    await rm(temporaryMarker, { force: true });
  }
}

function decodeUrlPath(urlPath: string): string | null {
  try {
    return decodeURIComponent(urlPath);
  } catch {
    return null;
  }
}

function isUnsafeSegment(segment: string): boolean {
  return (
    segment.length === 0 ||
    segment.trim().length === 0 ||
    segment === '.' ||
    segment === '..' ||
    segment.includes('\\') ||
    segment.includes('\0')
  );
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(directory, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}
