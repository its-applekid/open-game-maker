import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function lstatExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

const COPY_MARKER = '.gm-pack-copy';

export function isManagedCopy(destination: string, target: string): boolean {
  const marker = join(destination, COPY_MARKER);
  return lstatExists(marker) && lstatSync(marker).isFile() && readFileSync(marker, 'utf8') === `${target}\n`;
}

export function markManagedCopy(destination: string, target: string): void {
  writeFileSync(join(destination, COPY_MARKER), `${target}\n`);
}

export function removeManagedCopyMarker(destination: string, target: string): boolean {
  if (!isManagedCopy(destination, target)) return false;
  rmSync(join(destination, COPY_MARKER), { force: true });
  return true;
}

export function fileSha256(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

export function managedPathConflict(root: string, path: string): boolean {
  if (lstatExists(root) && !lstatSync(root).isDirectory()) return true;
  let current = root;
  const segments = path.split('/');
  for (const [index, segment] of segments.entries()) {
    current = join(current, segment);
    if (!lstatExists(current)) return false;
    const entry = lstatSync(current);
    if (index === segments.length - 1) return !entry.isFile();
    if (!entry.isDirectory()) return true;
  }
  return false;
}

export function installedHash(root: string, path: string): string | null {
  if (managedPathConflict(root, path)) return null;
  const file = join(root, path);
  return lstatExists(file) && lstatSync(file).isFile() ? fileSha256(file) : null;
}

export function prepareManagedFile(root: string, path: string): string {
  mkdirSync(root, { recursive: true });
  let current = root;
  const segments = path.split('/');
  for (const segment of segments.slice(0, -1)) {
    current = join(current, segment);
    if (lstatExists(current) && !lstatSync(current).isDirectory()) rmSync(current, { recursive: true, force: true });
    mkdirSync(current, { recursive: true });
  }
  const file = join(root, path);
  if (lstatExists(file) && !lstatSync(file).isFile()) rmSync(file, { recursive: true, force: true });
  return file;
}

export function removeManagedFile(root: string, path: string): boolean {
  if (managedPathConflict(root, path)) return false;
  const file = join(root, path);
  if (!lstatExists(file)) return false;
  rmSync(file, { force: true });
  return true;
}
