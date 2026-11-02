import { createReadStream } from 'node:fs';
import { open, type FileHandle } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { createInflateRaw } from 'node:zlib';

import { validName } from './zip-write.js';

export type ZipEntry = { name: string; method: number; compressedSize: number; size: number; offset: number };

const MAX32 = 0xffffffff;

/** Reads a zip's central directory (zip64 aware) and streams single entries; nothing is loaded whole. */
export class ZipReader {
  private constructor(
    private readonly handle: FileHandle,
    private readonly fileSize: number,
    readonly entries: ZipEntry[],
  ) {}

  static async open(path: string): Promise<ZipReader> {
    const handle = await open(path, 'r');
    try {
      const fileSize = (await handle.stat()).size;
      return new ZipReader(handle, fileSize, await readDirectory(handle, fileSize));
    } catch (error) {
      await handle.close();
      throw error;
    }
  }

  /** The entry's uncompressed bytes. Stored (0) and deflated (8) entries are supported. */
  async stream(entry: ZipEntry): Promise<Readable> {
    const local = await read(this.handle, entry.offset, 30, this.fileSize, `zip entry ${entry.name} header`);
    if (local.readUInt32LE(0) !== 0x04034b50) throw new Error(`zip entry ${entry.name} has no local header`);
    const start = entry.offset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
    range(start, entry.compressedSize, this.fileSize, `zip entry ${entry.name} data`);
    if (entry.compressedSize === 0) return Readable.from([]);
    const raw = createReadStream('', {
      fd: this.handle.fd,
      start,
      end: start + entry.compressedSize - 1,
      autoClose: false,
      highWaterMark: 1 << 20,
    });
    if (entry.method === 0) return raw;
    if (entry.method === 8) {
      const inflate = createInflateRaw();
      raw.on('error', (error) => inflate.destroy(error));
      return raw.pipe(inflate);
    }
    throw new Error(`zip entry ${entry.name} uses unsupported compression method ${entry.method}`);
  }

  async close(): Promise<void> {
    await this.handle.close();
  }
}

function range(position: number, length: number, fileSize: number, label: string): void {
  if (
    !Number.isSafeInteger(position) ||
    !Number.isSafeInteger(length) ||
    position < 0 ||
    length < 0 ||
    position > fileSize ||
    length > fileSize - position
  ) {
    throw new Error(`${label} is outside the zip file`);
  }
}

async function read(
  handle: FileHandle,
  position: number,
  length: number,
  fileSize: number,
  label: string,
): Promise<Buffer> {
  range(position, length, fileSize, label);
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, position);
  if (bytesRead !== length) throw new Error('zip file is truncated');
  return buffer;
}

async function readDirectory(handle: FileHandle, fileSize: number): Promise<ZipEntry[]> {
  const tailLength = Math.min(fileSize, 22 + 0xffff);
  const tail = await read(handle, fileSize - tailLength, tailLength, fileSize, 'zip end record');
  let eocd = -1;
  for (let index = tail.length - 22; index >= 0; index -= 1) {
    if (tail.readUInt32LE(index) === 0x06054b50 && index + 22 + tail.readUInt16LE(index + 20) === tail.length) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a zip file (no end of central directory)');
  let count = tail.readUInt16LE(eocd + 10);
  let size = tail.readUInt32LE(eocd + 12);
  let start = tail.readUInt32LE(eocd + 16);
  if (eocd >= 20 && tail.readUInt32LE(eocd - 20) === 0x07064b50) {
    const record = await read(handle, Number(tail.readBigUInt64LE(eocd - 12)), 56, fileSize, 'zip64 end record');
    if (record.readUInt32LE(0) !== 0x06064b50) throw new Error('zip64 end of central directory is missing');
    count = Number(record.readBigUInt64LE(32));
    size = Number(record.readBigUInt64LE(40));
    start = Number(record.readBigUInt64LE(48));
  }

  if (!Number.isSafeInteger(count) || count < 0) throw new Error('zip entry count is invalid');
  const directory = await read(handle, start, size, fileSize, 'zip central directory');
  const entries: ZipEntry[] = [];
  let cursor = 0;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > directory.length) throw new Error('zip central directory is truncated');
    if (directory.readUInt32LE(cursor) !== 0x02014b50) throw new Error('zip central directory is corrupt');
    const nameLength = directory.readUInt16LE(cursor + 28);
    const extraLength = directory.readUInt16LE(cursor + 30);
    const commentLength = directory.readUInt16LE(cursor + 32);
    const name = directory.toString('utf8', cursor + 46, cursor + 46 + nameLength);
    let compressedSize = directory.readUInt32LE(cursor + 20);
    let entrySize = directory.readUInt32LE(cursor + 24);
    let offset = directory.readUInt32LE(cursor + 42);
    const extraStart = cursor + 46 + nameLength;
    const recordEnd = extraStart + extraLength + commentLength;
    if (recordEnd > directory.length) throw new Error('zip central directory entry is truncated');
    for (let field = extraStart; field + 4 <= extraStart + extraLength;) {
      const id = directory.readUInt16LE(field);
      const length = directory.readUInt16LE(field + 2);
      if (field + 4 + length > extraStart + extraLength) throw new Error('zip extra field is truncated');
      if (id === 1) {
        let value = field + 4;
        const next = (): number => {
          if (value + 8 > field + 4 + length) throw new Error('zip64 extra field is truncated');
          const result = Number(directory.readBigUInt64LE(value));
          if (!Number.isSafeInteger(result)) throw new Error('zip64 value exceeds the safe integer range');
          value += 8;
          return result;
        };
        if (entrySize === MAX32) entrySize = next();
        if (compressedSize === MAX32) compressedSize = next();
        if (offset === MAX32) offset = next();
      }
      field += 4 + length;
    }
    range(offset, 0, fileSize, `zip entry ${name} offset`);
    if (!Number.isSafeInteger(compressedSize) || !Number.isSafeInteger(entrySize)) {
      throw new Error(`zip entry ${name} size exceeds the safe integer range`);
    }
    if (!name.endsWith('/')) {
      validName(name);
      entries.push({ name, method: directory.readUInt16LE(cursor + 10), compressedSize, size: entrySize, offset });
    }
    cursor = recordEnd;
  }
  return entries;
}
