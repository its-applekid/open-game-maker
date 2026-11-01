import { readFile } from 'node:fs/promises';

import { FsBlobStore } from './fs-store.js';
import { gc } from './gc.js';
import { type BlobHash } from './hash.js';

type CliIo = { stdout(line: string): void; stderr(line: string): void };

const defaultIo: CliIo = {
  stdout: (line) => console.log(line),
  stderr: (line) => console.error(line),
};

function usage(): string {
  return 'Usage: ogm-blob-gc --root DIR --roots FILE [--grace-days 30] [--apply]';
}

function parseArgs(argv: string[]): {
  root: string;
  rootsFile: string;
  graceDays: number;
  apply: boolean;
} {
  let root: string | undefined;
  let rootsFile: string | undefined;
  let graceDays = 30;
  let apply = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--apply') {
      apply = true;
      continue;
    }
    if (argument === '--root' || argument === '--roots' || argument === '--grace-days') {
      const value = argv[index + 1];
      if (value === undefined) throw new Error(`Missing value for ${argument}`);
      index += 1;
      if (argument === '--root') root = value;
      if (argument === '--roots') rootsFile = value;
      if (argument === '--grace-days') graceDays = Number(value);
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  if (!root || !rootsFile) throw new Error(usage());
  if (!Number.isFinite(graceDays) || graceDays < 0) throw new Error('Invalid --grace-days');
  return { root, rootsFile, graceDays, apply };
}

async function readRoots(path: string): Promise<BlobHash[]> {
  return (await readFile(path, 'utf8'))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#')) as BlobHash[];
}

export async function runBlobGcCli(argv: string[], io: CliIo = defaultIo, nowMs = Date.now()): Promise<number> {
  try {
    const args = parseArgs(argv);
    const roots = await readRoots(args.rootsFile);
    const store = new FsBlobStore({
      root: args.root,
      signingKey: '',
      publicOrigin: 'http://127.0.0.1',
    });
    const result = await gc(store, roots, {
      graceMs: args.graceDays * 86_400_000,
      nowMs,
      dryRun: !args.apply,
    });
    io.stdout(
      JSON.stringify({
        scanned: result.scanned,
        kept: result.kept,
        deleted: result.deleted.length,
        dryRun: !args.apply,
      }),
    );
    return 0;
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : 'Blob GC failed');
    return 1;
  }
}
