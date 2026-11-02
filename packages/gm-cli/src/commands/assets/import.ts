import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { link, mkdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';

import { FsBlobStore } from '@ogm/blob-store';

import { ZipReader, type ZipEntry } from '../../assets-export/zip-read.js';
import { CommandError, EXIT, UsageError, type GmCommand } from '../../command.js';
import { requireAssetsRoot } from '../../context.js';
import { sha256File } from '../../lock.js';

type Expected = { sha256: string; mime?: string };

async function readText(zip: ZipReader, entry: ZipEntry): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of await zip.stream(entry)) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

/** Stream one entry to `temporary`, returning the sha256 of the bytes written. */
async function stage(zip: ZipReader, entry: ZipEntry, temporary: string): Promise<string> {
  await mkdir(dirname(temporary), { recursive: true });
  const hash = createHash('sha256');
  const tap = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      hash.update(chunk);
      done(null, chunk);
    },
  });
  await pipeline(await zip.stream(entry), tap, createWriteStream(temporary, { flags: 'wx' }));
  return hash.digest('hex');
}

async function shaOrNull(path: string): Promise<string | null> {
  try {
    return await sha256File(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
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
      const report = JSON.parse(await readText(zip, reportEntry)) as { included?: Array<{ path: string } & Expected> };
      const expected = new Map((report.included ?? []).map((item) => [item.path, item]));

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
          if (await store!.head(`sha256:${sha}`)) {
            present += 1;
            continue;
          }
          const temporary = scratch(join(ctx.blobRoot!, 'tmp'));
          try {
            const actual = await stage(zip, entry, temporary);
            if (actual !== sha) {
              failed.push(`${entry.name}: bytes hash to ${actual}; skipped`);
              continue;
            }
            await store!.put(createReadStream(temporary), want.mime ?? 'application/octet-stream');
            added.push(entry.name);
          } finally {
            await rm(temporary, { force: true });
          }
          continue;
        }

        const destination = join(assetsRoot!, 'packs', ...entry.name.split('/').slice(1));
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
          const actual = await stage(zip, entry, temporary);
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
