import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export type WalkedFile = { abs: string; rel: string; size: number; mtimeMs: number };

export const PREVIEW_KINDS = ['thumb', 'sheet', 'waveform', 'clip'] as const;
export type PreviewKind = (typeof PREVIEW_KINDS)[number];

/** Library-relative path with `/` separators, as written in the feed and the blob mapping. */
export function relKey(root: string, abs: string): string {
  return relative(root, abs).split(sep).join('/');
}

/** Resolve a card bucket key without allowing `..` or an absolute path to escape the asset library. */
export function libraryPath(root: string, key: string): string | null {
  const abs = resolve(root, key);
  const rel = relative(root, abs);
  if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
  return abs;
}

/** Every regular file under `dir` (a missing dir yields nothing, other read errors throw); symlinks are skipped so a link cannot pull in outside files. */
export async function* walk(root: string, dir: string): AsyncGenerator<WalkedFile> {
  let names: string[];
  try {
    names = (await readdir(dir)).sort();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return;
    throw error;
  }
  for (const name of names) {
    const abs = join(dir, name);
    const info = await lstat(abs);
    if (info.isDirectory()) yield* walk(root, abs);
    else if (info.isFile()) yield { abs, rel: relKey(root, abs), size: info.size, mtimeMs: info.mtimeMs };
  }
}

/** Streaming sha256 in 1 MiB chunks, lowercase hex. */
export async function sha256File(abs: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(abs, { highWaterMark: 1 << 20 })) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

export const LINE = /^([0-9a-f]{64}) {2}([0-9]+) {2}([^\n]+)$/;

export function formatLine(sha: string, bytes: number, rel: string): string {
  return `${sha}  ${bytes}  ${rel}`;
}

/** Bytewise sort (not localeCompare, not UTF-16 order), unique by (sha256, path). */
export function sortLines(lines: string[]): string[] {
  const byKey = new Map<string, string>();
  for (const line of lines) {
    const match = LINE.exec(line);
    byKey.set(match ? `${match[1]}  ${match[3]}` : line, line);
  }
  return [...byKey.values()]
    .map((line) => Buffer.from(line))
    .sort(Buffer.compare)
    .map((buffer) => buffer.toString());
}
