import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { link, lstat, mkdir, realpath, rm } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';

import { blobPath, FsBlobStore } from '@ogm/blob-store';

import { ZipReader, type ZipEntry } from '../../assets-export/zip-read.js';
import { CommandError, EXIT, UsageError, type GmCommand } from '../../command.js';
import { requireAssetsRoot } from '../../context.js';
import { sha256File } from '../../lock.js';

type Expected = { sha256: string; bytes: number; mime?: string };

const MAX_REPORT_BYTES = 16 * 1024 * 1024;

async function readText(zip: ZipReader, entry: ZipEntry): Promise<string> {
  if (entry.size > MAX_REPORT_BYTES) throw new CommandError('rights-report.json is too large');
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of await zip.stream(entry)) {
    bytes += chunk.byteLength;
    if (bytes > MAX_REPORT_BYTES) throw new CommandError('rights-report.json expands past the size limit');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Stream one entry to `temporary`, returning the sha256 of the bytes written. */
async function stage(zip: ZipReader, entry: ZipEntry, temporary: string, expectedBytes: number): Promise<string> {
  const hash = createHash('sha256');
  let bytes = 0;
  const tap = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      bytes += chunk.byteLength;
      if (bytes > expectedBytes) {
        done(new CommandError(`zip entry ${entry.name} expands beyond its reported ${expectedBytes} bytes`));
        return;
      }
      hash.update(chunk);
      done(null, chunk);
    },
  });
  try {
    await pipeline(await zip.stream(entry), tap, createWriteStream(temporary, { flags: 'wx' }));
  } catch (error) {
    if (error instanceof CommandError) throw error;
    throw new CommandError(`zip entry ${entry.name} is unreadable: ${(error as Error).message}`);
  }
  if (bytes !== expectedBytes) {
    throw new CommandError(`zip entry ${entry.name} contains ${bytes}, not ${expectedBytes}, bytes`);
  }
  return hash.digest('hex');
}

async function shaOrNull(path: string): Promise<string | null> {
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink()) throw new CommandError(`refusing symbolic-link import destination ${path}`);
    if (!info.isFile()) throw new CommandError(`refusing non-file import destination ${path}`);
    return await sha256File(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function expectedFiles(value: unknown): Map<string, Expected> {
  const included =
    typeof value === 'object' && value !== null && Array.isArray((value as { included?: unknown }).included)
      ? (value as { included: unknown[] }).included
      : null;
  if (included === null) throw new CommandError('rights-report.json has no included file list');
  const result = new Map<string, Expected>();
  for (const item of included) {
    const value = item as Record<string, unknown>;
    if (
      typeof item !== 'object' ||
      item === null ||
      typeof value.path !== 'string' ||
      typeof value.sha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(value.sha256) ||
      typeof value.bytes !== 'number' ||
      !Number.isSafeInteger(value.bytes) ||
      value.bytes < 0 ||
      (value.mime !== undefined &&
        (typeof value.mime !== 'string' || value.mime.length === 0 || /[\r\n]/.test(value.mime)))
    ) {
      throw new CommandError('rights-report.json has an invalid included file');
    }
    const expected = value as { path: string } & Expected;
    if (result.has(expected.path)) throw new CommandError(`rights-report.json lists ${expected.path} more than once`);
    result.set(expected.path, expected);
  }
  return result;
}

/** Make a library destination without following a symlink in any parent component. */
async function libraryDestination(root: string, entryName: string): Promise<string> {
  await mkdir(root, { recursive: true });
  const realRoot = await realpath(root);
  let current = realRoot;
  const parts = ['packs', ...entryName.split('/').slice(1)];
  for (const part of parts.slice(0, -1)) {
    const next = join(current, part);
    try {
      const info = await lstat(next);
      if (info.isSymbolicLink() || !info.isDirectory()) {
        throw new CommandError(`refusing unsafe import directory ${next}`);
      }
    } catch (error) {
      if (error instanceof CommandError) throw error;
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      try {
        await mkdir(next);
      } catch (mkdirError) {
        if ((mkdirError as NodeJS.ErrnoException).code !== 'EEXIST') throw mkdirError;
      }
      const info = await lstat(next);
      if (info.isSymbolicLink() || !info.isDirectory()) {
        throw new CommandError(`refusing unsafe import directory ${next}`);
      }
    }
    current = await realpath(next);
    const local = relative(realRoot, current);
    if (local === '..' || local.startsWith(`..${sep}`)) {
      throw new CommandError(`refusing import directory outside ${root}`);
    }
  }
  return join(current, basename(parts.at(-1)!));
}

function scratch(dir: string): string {
  return join(dir, `.gm-import.${process.pid}.${randomBytes(6).toString('hex')}.tmp`);
}

export const command: GmCommand = {
  name: 'assets import',
  summary: 'unpack an assets export into this instance library and blob store, sha-verified, never overwriting',
  usage: '<zip>',
  example: 'assets import my-game-assets.zip',
  flags: {},
  async run(ctx, args) {
    if (args.length !== 1) throw new UsageError('give exactly one zip', 'gm assets import <zip>');
    let zip: ZipReader;
    try {
      zip = await ZipReader.open(resolve(ctx.cwd, args[0]!));
    } catch (error) {
      throw new CommandError(`${args[0]} is not a usable assets export: ${(error as Error).message}`);
    }
    try {
      const reportEntry = zip.entries.find((entry) => entry.name === 'rights-report.json');
      if (!reportEntry)
        throw new CommandError('the zip has no rights-report.json; it was not made by gm assets export');
      let report: unknown;
      try {
        report = JSON.parse(await readText(zip, reportEntry));
      } catch (error) {
        if (error instanceof CommandError) throw error;
        throw new CommandError(`rights-report.json is invalid: ${(error as Error).message}`);
      }
      const expected = expectedFiles(report);

      const payload = zip.entries.filter(
        (entry) => entry.name.startsWith('library/') || entry.name.startsWith('blobs/'),
      );
      const assetsRoot = payload.some((entry) => entry.name.startsWith('library/')) ? requireAssetsRoot(ctx) : null;
      const blobs = payload.some((entry) => entry.name.startsWith('blobs/'));
      if (blobs && ctx.blobRoot === null) {
        throw new UsageError(
          'the zip holds blobs but OGM_BLOB_ROOT is unset',
          'OGM_BLOB_ROOT=<blob root> gm assets import <zip>',
        );
      }
      const store = blobs
        ? new FsBlobStore({ root: ctx.blobRoot!, signingKey: 'unused', publicOrigin: 'http://127.0.0.1' })
        : null;

      const added: string[] = [];
      const failed: string[] = [];
      let present = 0;
      let lastProgress = Date.now();
      for (const [index, entry] of payload.entries()) {
        if (!ctx.json && Date.now() - lastProgress >= 1000) {
          lastProgress = Date.now();
          ctx.err(`import: ${index}/${payload.length} files`);
        }
        const want = expected.get(entry.name);
        if (!want) {
          failed.push(`${entry.name}: not listed in rights-report.json; skipped`);
          continue;
        }

        if (entry.name.startsWith('blobs/')) {
          const sha = entry.name.slice('blobs/'.length);
          if (!/^[0-9a-f]{64}$/.test(sha) || sha !== want.sha256) {
            failed.push(`${entry.name}: blob name and reported sha256 disagree; skipped`);
            continue;
          }
          if (entry.size !== want.bytes) {
            failed.push(`${entry.name}: zip size ${entry.size} disagrees with reported ${want.bytes}; skipped`);
            continue;
          }
          const destination = blobPath(ctx.blobRoot!, `sha256:${sha}`);
          const existing = await shaOrNull(destination);
          if (existing !== null) {
            if (existing !== sha) {
              failed.push(`${entry.name}: a different blob is already at ${destination}; kept it`);
              continue;
            }
            if (!(await store!.head(`sha256:${sha}`))) {
              await store!.put(createReadStream(destination), want.mime ?? 'application/octet-stream');
            }
            present += 1;
            continue;
          }
          await mkdir(join(ctx.blobRoot!, 'tmp'), { recursive: true });
          const temporary = scratch(join(ctx.blobRoot!, 'tmp'));
          try {
            const actual = await stage(zip, entry, temporary, want.bytes);
            if (actual !== sha) {
              failed.push(`${entry.name}: bytes hash to ${actual}; skipped`);
              continue;
            }
            await store!.put(createReadStream(temporary), want.mime ?? 'application/octet-stream');
            const stored = await shaOrNull(destination);
            if (stored !== sha) {
              failed.push(`${entry.name}: the blob store kept different bytes at ${destination}`);
              continue;
            }
            added.push(entry.name);
          } finally {
            await rm(temporary, { force: true });
          }
          continue;
        }

        if (entry.size !== want.bytes) {
          failed.push(`${entry.name}: zip size ${entry.size} disagrees with reported ${want.bytes}; skipped`);
          continue;
        }
        const destination = await libraryDestination(assetsRoot!, entry.name);
        const existing = await shaOrNull(destination);
        if (existing === want.sha256) {
          present += 1;
          continue;
        }
        if (existing !== null) {
          failed.push(`${entry.name}: a different file is already at ${destination}; kept it`);
          continue;
        }
        const temporary = scratch(dirname(destination));
        try {
          const actual = await stage(zip, entry, temporary, want.bytes);
          if (actual !== want.sha256) {
            failed.push(`${entry.name}: bytes hash to ${actual}, the report says ${want.sha256}; skipped`);
            continue;
          }
          try {
            await link(temporary, destination);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
            failed.push(`${entry.name}: a file appeared at ${destination} during import; kept it`);
            continue;
          }
          added.push(entry.name);
        } finally {
          await rm(temporary, { force: true });
        }
      }

      const inZip = new Set(payload.map((entry) => entry.name));
      for (const path of expected.keys()) {
        if (!inZip.has(path) && (path.startsWith('library/') || path.startsWith('blobs/'))) {
          failed.push(`${path}: listed in rights-report.json but missing from the zip`);
        }
      }

      ctx.emit('assets.import', { added: added.length, present, failed: failed.length });
      if (ctx.json) ctx.out(JSON.stringify({ added, present, failed }));
      else {
        added.forEach((path) => ctx.out(`added ${path}`));
        ctx.out(`imported ${added.length} files; ${present} already present; ${failed.length} failed`);
      }
      failed.forEach((line) => ctx.err(line));
      return failed.length > 0 ? EXIT.failed : EXIT.ok;
    } finally {
      await zip.close();
    }
  },
};
