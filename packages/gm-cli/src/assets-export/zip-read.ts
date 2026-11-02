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
    readonly entries: ZipEntry[],
  ) {}

  static async open(path: string): Promise<ZipReader> {
    const handle = await open(path, 'r');
    try {
      return new ZipReader(handle, await readDirectory(handle));
    } catch (error) {
      await handle.close();
      throw error;
    }
  }

  /** The entry's uncompressed bytes. Stored (0) and deflated (8) entries are supported. */
  async stream(entry: ZipEntry): Promise<Readable> {
    const local = await read(this.handle, entry.offset, 30);
    if (local.readUInt32LE(0) !== 0x04034b50) throw new Error(`zip entry ${entry.name} has no local header`);
    const start = entry.offset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
    if (entry.compressedSize === 0) return Readable.from([]);
    const raw = this.handle.createReadStream({
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

async function read(handle: FileHandle, position: number, length: number): Promise<Buffer> {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, position);
  if (bytesRead !== length) throw new Error('zip file is truncated');
  return buffer;
}

async function readDirectory(handle: FileHandle): Promise<ZipEntry[]> {
  const fileSize = (await handle.stat()).size;
  const tailLength = Math.min(fileSize, 22 + 0xffff);
  const tail = await read(handle, fileSize - tailLength, tailLength);
  let eocd = -1;
  for (let index = tail.length - 22; index >= 0; index -= 1) {
    if (tail.readUInt32LE(index) === 0x06054b50) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a zip file (no end of central directory)');
  let count = tail.readUInt16LE(eocd + 10);
  let size = tail.readUInt32LE(eocd + 12);
  let start = tail.readUInt32LE(eocd + 16);
  if (eocd >= 20 && tail.readUInt32LE(eocd - 20) === 0x07064b50) {
    const record = await read(handle, Number(tail.readBigUInt64LE(eocd - 12)), 56);
    if (record.readUInt32LE(0) !== 0x06064b50) throw new Error('zip64 end of central directory is missing');
    count = Number(record.readBigUInt64LE(32));
    size = Number(record.readBigUInt64LE(40));
    start = Number(record.readBigUInt64LE(48));
  }

  const directory = await read(handle, start, size);
  const entries: ZipEntry[] = [];
  let cursor = 0;
  for (let index = 0; index < count; index += 1) {
    if (directory.readUInt32LE(cursor) !== 0x02014b50) throw new Error('zip central directory is corrupt');
    const nameLength = directory.readUInt16LE(cursor + 28);
    const extraLength = directory.readUInt16LE(cursor + 30);
    const commentLength = directory.readUInt16LE(cursor + 32);
    const name = directory.toString('utf8', cursor + 46, cursor + 46 + nameLength);
    let compressedSize = directory.readUInt32LE(cursor + 20);
    let entrySize = directory.readUInt32LE(cursor + 24);
    let offset = directory.readUInt32LE(cursor + 42);
    const extraStart = cursor + 46 + nameLength;
    for (let field = extraStart; field + 4 <= extraStart + extraLength;) {
      const id = directory.readUInt16LE(field);
      const length = directory.readUInt16LE(field + 2);
      if (id === 1) {
        let value = field + 4;
        const next = (): number => {
          const result = Number(directory.readBigUInt64LE(value));
          value += 8;
          return result;
        };
        if (entrySize === MAX32) entrySize = next();
        if (compressedSize === MAX32) compressedSize = next();
        if (offset === MAX32) offset = next();
      }
      field += 4 + length;
    }
    if (!name.endsWith('/')) {
      validName(name);
      entries.push({ name, method: directory.readUInt16LE(cursor + 10), compressedSize, size: entrySize, offset });
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
