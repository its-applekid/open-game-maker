import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { gunzipSync } from 'node:zlib';

export class BadArchive extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'BadArchive';
  }
}

export const ARCHIVE_LIMITS = { compressedBytes: 256 * 1024 * 1024, unpackedBytes: 512 * 1024 * 1024, entries: 20_000 };

const SAFE_SEGMENT = /^(?!\.{1,2}$)[^\\\0]+$/u;

// Unpacks a gzipped ustar archive into `target`, which must be empty. Only regular files and directories are
// accepted: a link, device or path that climbs out is refused, so a hostile build cannot write outside `target`.
export async function untarGz(archive: Buffer, target: string, limits = ARCHIVE_LIMITS): Promise<void> {
  if (archive.length > limits.compressedBytes) throw new BadArchive('archive_too_large');
  let tar: Buffer;
  try {
    tar = gunzipSync(archive, { maxOutputLength: limits.unpackedBytes + 1024 * 1024 });
  } catch {
    throw new BadArchive('archive_not_gzip');
  }

  let offset = 0;
  let entries = 0;
  let unpacked = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) return;
    if (++entries > limits.entries) throw new BadArchive('archive_too_many_entries');
    if (!checksumMatches(header)) throw new BadArchive('archive_bad_header');

    const size = octal(header.subarray(124, 136));
    const type = String.fromCharCode(header[156] ?? 0);
    const path = entryPath(header);
    const body = offset + 512;
    offset = body + Math.ceil(size / 512) * 512;
    if (offset > tar.length) throw new BadArchive('archive_truncated');

    const segments = path.split('/').filter((segment) => segment !== '' && segment !== '.');
    if (path.startsWith('/') || segments.some((segment) => !SAFE_SEGMENT.test(segment))) {
      throw new BadArchive('archive_unsafe_path');
    }
    if (type === '5') {
      if (segments.length > 0) await mkdir(join(target, ...segments), { recursive: true });
      continue;
    }
    if (type !== '0' && type !== '\0') throw new BadArchive('archive_unsupported_entry');
    if (segments.length === 0) throw new BadArchive('archive_unsafe_path');
    unpacked += size;
    if (unpacked > limits.unpackedBytes) throw new BadArchive('archive_too_large');
    const file = join(target, ...segments);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, tar.subarray(body, body + size), { flag: 'wx', mode: 0o644 });
  }
  throw new BadArchive('archive_truncated');
}

function entryPath(header: Buffer): string {
  const name = cString(header.subarray(0, 100));
  const magic = header.subarray(257, 262).toString('latin1');
  const prefix = magic === 'ustar' ? cString(header.subarray(345, 500)) : '';
  return prefix ? `${prefix}/${name}` : name;
}

function cString(field: Buffer): string {
  const end = field.indexOf(0);
  return field.subarray(0, end === -1 ? field.length : end).toString('utf8');
}

function octal(field: Buffer): number {
  const text = cString(field).trim();
  if (!/^[0-7]*$/u.test(text)) throw new BadArchive('archive_bad_header');
  return text === '' ? 0 : Number.parseInt(text, 8);
}

function checksumMatches(header: Buffer): boolean {
  let sum = 0;
  for (let index = 0; index < 512; index += 1) sum += index >= 148 && index < 156 ? 32 : header[index]!;
  try {
    return octal(header.subarray(148, 156)) === sum;
  } catch {
    return false;
  }
}
