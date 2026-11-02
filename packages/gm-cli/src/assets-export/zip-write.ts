import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, stat, type FileHandle } from 'node:fs/promises';
import { crc32 } from 'node:zlib';

/** Stored (uncompressed) entries, fixed 1980-01-01 timestamps and caller-chosen order: same input, same bytes. */
const DOS_DATE = (0 << 9) | (1 << 5) | 1;
const UTF8 = 0x0800;
const VERSION = 45;
const MADE_BY = (3 << 8) | VERSION;
const FILE_MODE = (0o100644 << 16) >>> 0;
const MAX32 = 0xffffffff;
const MAX16 = 0xffff;

type Central = { name: Buffer; crc: number; size: number; offset: number };

export type Written = { bytes: number; sha256: string };

/**
 * Writes a zip to a seekable file one entry at a time; no entry is held in memory. Each local header is
 * written with a zero CRC that is patched in place once the entry's bytes have streamed through.
 * `limit` is the zip64 threshold (only tests lower it).
 */
export class ZipWriter {
  #offset = 0;
  readonly #central: Central[] = [];

  private constructor(
    private readonly handle: FileHandle,
    private readonly limit: number,
  ) {}

  static async create(path: string, limit = MAX32): Promise<ZipWriter> {
    return new ZipWriter(await open(path, 'wx'), limit);
  }

  async addFile(name: string, path: string): Promise<Written> {
    const size = (await stat(path)).size;
    const header = await this.#header(name, size);
    const sha = createHash('sha256');
    let crc = 0;
    let bytes = 0;
    for await (const chunk of createReadStream(path, { highWaterMark: 1 << 20 }) as AsyncIterable<Buffer>) {
      crc = crc32(chunk, crc);
      sha.update(chunk);
      bytes += chunk.byteLength;
      await this.#write(chunk);
    }
    if (bytes !== size) throw new Error(`${path} changed size while it was being exported`);
    await this.#finish(header, crc);
    return { bytes, sha256: sha.digest('hex') };
  }

  async addBuffer(name: string, data: Buffer): Promise<Written> {
    const header = await this.#header(name, data.byteLength);
    await this.#write(data);
    await this.#finish(header, crc32(data));
    return { bytes: data.byteLength, sha256: createHash('sha256').update(data).digest('hex') };
  }

  async close(): Promise<void> {
    try {
      const start = this.#offset;
      for (const entry of this.#central) await this.#write(this.#centralRecord(entry));
      const size = this.#offset - start;
      const count = this.#central.length;
      if (count >= MAX16 || start >= this.limit || size >= this.limit) {
        const record = this.#offset;
        const eocd64 = Buffer.alloc(56);
        eocd64.writeUInt32LE(0x06064b50, 0);
        eocd64.writeBigUInt64LE(44n, 4);
        eocd64.writeUInt16LE(MADE_BY, 12);
        eocd64.writeUInt16LE(VERSION, 14);
        eocd64.writeBigUInt64LE(BigInt(count), 24);
        eocd64.writeBigUInt64LE(BigInt(count), 32);
        eocd64.writeBigUInt64LE(BigInt(size), 40);
        eocd64.writeBigUInt64LE(BigInt(start), 48);
        const locator = Buffer.alloc(20);
        locator.writeUInt32LE(0x07064b50, 0);
        locator.writeBigUInt64LE(BigInt(record), 8);
        locator.writeUInt32LE(1, 16);
        await this.#write(Buffer.concat([eocd64, locator]));
      }
      const eocd = Buffer.alloc(22);
      eocd.writeUInt32LE(0x06054b50, 0);
      eocd.writeUInt16LE(Math.min(count, MAX16), 8);
      eocd.writeUInt16LE(Math.min(count, MAX16), 10);
      eocd.writeUInt32LE(size >= this.limit ? MAX32 : size, 12);
      eocd.writeUInt32LE(start >= this.limit ? MAX32 : start, 16);
      await this.#write(eocd);
      await this.handle.sync();
    } finally {
      await this.handle.close();
    }
  }

  /** Close without finishing; the caller removes the partial file. */
  async abort(): Promise<void> {
    await this.handle.close().catch(() => undefined);
  }

  async #header(name: string, size: number): Promise<Central> {
    validName(name);
    const encoded = Buffer.from(name, 'utf8');
    const big = size >= this.limit;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(VERSION, 4);
    local.writeUInt16LE(UTF8, 6);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(big ? MAX32 : size, 18);
    local.writeUInt32LE(big ? MAX32 : size, 22);
    local.writeUInt16LE(encoded.byteLength, 26);
    const extra = big ? zip64Extra([size, size]) : Buffer.alloc(0);
    local.writeUInt16LE(extra.byteLength, 28);
    const entry = { name: encoded, crc: 0, size, offset: this.#offset };
    await this.#write(Buffer.concat([local, encoded, extra]));
    return entry;
  }

  async #finish(entry: Central, crc: number): Promise<void> {
    entry.crc = crc;
    const field = Buffer.alloc(4);
    field.writeUInt32LE(crc >>> 0, 0);
    await this.handle.write(field, 0, 4, entry.offset + 14);
    this.#central.push(entry);
  }

  #centralRecord(entry: Central): Buffer {
    const big = entry.size >= this.limit;
    const far = entry.offset >= this.limit;
    const extra = zip64Extra([...(big ? [entry.size, entry.size] : []), ...(far ? [entry.offset] : [])]);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(MADE_BY, 4);
    record.writeUInt16LE(VERSION, 6);
    record.writeUInt16LE(UTF8, 8);
    record.writeUInt16LE(DOS_DATE, 14);
    record.writeUInt32LE(entry.crc >>> 0, 16);
    record.writeUInt32LE(big ? MAX32 : entry.size, 20);
    record.writeUInt32LE(big ? MAX32 : entry.size, 24);
    record.writeUInt16LE(entry.name.byteLength, 28);
    record.writeUInt16LE(extra.byteLength, 30);
    record.writeUInt32LE(FILE_MODE, 38);
    record.writeUInt32LE(far ? MAX32 : entry.offset, 42);
    return Buffer.concat([record, entry.name, extra]);
  }

  async #write(data: Buffer): Promise<void> {
    let done = 0;
    while (done < data.byteLength) {
      const { bytesWritten } = await this.handle.write(data, done, data.byteLength - done, this.#offset + done);
      done += bytesWritten;
    }
    this.#offset += data.byteLength;
  }
}

function zip64Extra(values: number[]): Buffer {
  if (values.length === 0) return Buffer.alloc(0);
  const extra = Buffer.alloc(4 + values.length * 8);
  extra.writeUInt16LE(1, 0);
  extra.writeUInt16LE(values.length * 8, 2);
  values.forEach((value, index) => extra.writeBigUInt64LE(BigInt(value), 4 + index * 8));
  return extra;
}

/** Zip entry names: relative, forward slashes, no empty, `.` or `..` segment. */
export function validName(name: string): void {
  const parts = name.split('/');
  if (
    name.includes('\\') ||
    name.includes('\0') ||
    name.startsWith('/') ||
    parts.some((part) => part === '' || part === '.' || part === '..')
  ) {
    throw new Error(`unsafe zip entry name: ${name}`);
  }
}
