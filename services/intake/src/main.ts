import { randomBytes } from 'node:crypto';
import { link, mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadEnv } from '@ogm/config';

import { knownLicense, openQueue, type OpenEntry } from './queue.js';
import { runImport, type ImportResult, type ImportRunner } from './run.js';
import { readStatus, writeStatus, type DoneJob, type JobStatus } from './status.js';

export type { ImportRunner } from './run.js';

type Emit = (name: string, payload: Record<string, unknown>) => void;

type PollOptions = {
  assetsRoot: string;
  stateDir: string;
  gmBin?: string;
  run?: ImportRunner;
  emit?: Emit;
  now?: () => Date;
};

const sleep = (milliseconds: number) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'drop'
  );
}

async function writeOnce(path: string, value: unknown): Promise<boolean> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${randomBytes(5).toString('hex')}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    await link(temporary, path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  } finally {
    await rm(temporary, { force: true });
  }
}

function canonicalIntake(entry: OpenEntry, result: ImportResult, confirmedBy: string | null) {
  return {
    status: result.status,
    collection: result.collection,
    license: result.license,
    rights: result.rights ?? entry.manifest.usage_rights ?? null,
    confirmed_by: confirmedBy,
    date: entry.manifest.downloaded_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
  };
}

function eventName(status: JobStatus): string {
  return `intake.${status}`;
}

export async function pollIntake(options: PollOptions): Promise<{ hadError: boolean }> {
  const runner = options.run ?? runImport;
  const emit =
    options.emit ?? ((name, payload) => process.stdout.write(`${JSON.stringify({ event: name, ...payload })}\n`));
  const now = options.now ?? (() => new Date());
  const statusPath = join(resolve(options.stateDir), 'intake', 'status.json');
  const previous = await readStatus(statusPath);
  const { open: entries, problems } = await openQueue(options.assetsRoot);
  const done = [...previous.done];
  const counts = { ...previous.counts };
  const seen = new Map(done.map((job) => [job.fingerprint, job]));
  let lastError: string | null = problems.at(-1) ?? null;
  let failures = problems.length;
  for (const problem of problems) emit('intake.error', { error: problem });

  const record = (entry: OpenEntry, status: JobStatus, collection: string | null): void => {
    const job: DoneJob = {
      drop_id: entry.entry.drop_id,
      status,
      collection,
      at: now().toISOString(),
      fingerprint: entry.fingerprint,
    };
    done.push(job);
    counts[status] = (counts[status] ?? 0) + 1;
    seen.set(entry.fingerprint, job);
    emit(eventName(status), { drop_id: entry.entry.drop_id, status, collection });
  };

  for (const entry of entries) {
    if (!entry.manifest.integrity_ok) {
      const reason = (entry.manifest.problems ?? ['integrity check failed']).join('; ');
      if (!(await writeOnce(entry.intakePath, { status: 'blocked', reason }))) continue;
      record(entry, 'blocked', null);
      continue;
    }
    const duplicate = seen.get(entry.fingerprint);
    if (duplicate) {
      const wrote = await writeOnce(entry.intakePath, {
        status: 'duplicate',
        collection: duplicate.collection,
        license: null,
        rights: entry.manifest.usage_rights ?? null,
        confirmed_by: null,
        date: entry.manifest.downloaded_at?.slice(0, 10) ?? now().toISOString().slice(0, 10),
      });
      if (!wrote) continue;
      record(entry, 'duplicate', duplicate.collection);
      continue;
    }
    try {
      const license = await knownLicense(entry, options.assetsRoot);
      const prefix = license === 'CC0-1.0' ? 'kenney' : 'drive';
      const id = `${prefix}-${slug(entry.entry.name)}-${slug(entry.entry.drop_id).replaceAll('-', '').slice(0, 8) || 'drop'}`;
      const args = ['packs', 'import', '--from-queue', entry.entry.drop_id, '--id', id, '--json'];
      if (license) args.push('--license', license);
      const result = await runner({
        gmBin: options.gmBin ?? 'gm',
        nice: ['-n', '10'],
        args,
        id,
        dropId: entry.entry.drop_id,
      });
      await writeOnce(entry.intakePath, canonicalIntake(entry, result, result.confirmed_by ?? null));
      record(entry, result.status, result.collection);
    } catch (error) {
      failures += 1;
      const message = error instanceof Error ? error.message : String(error);
      lastError = `${entry.entry.drop_id}: ${message}`;
      emit('intake.error', { drop_id: entry.entry.drop_id, error: message });
    }
  }

  const recent = done.slice(-50);
  await writeStatus(statusPath, {
    updated: now().toISOString(),
    open: failures,
    counts,
    done: recent,
    last_error: lastError,
  });
  // A permanently bad queue line is reported but must not slow every other drop to the error backoff.
  return { hadError: failures > problems.length };
}

export async function main(): Promise<never> {
  const config = loadEnv('intake', {
    OGM_ASSETS_ROOT: { kind: 'path' },
    OGM_STATE_DIR: { kind: 'path' },
  });
  while (true) {
    let hadError = true;
    try {
      ({ hadError } = await pollIntake({ assetsRoot: config.OGM_ASSETS_ROOT, stateDir: config.OGM_STATE_DIR }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`intake poll failed: ${message}\n`);
    }
    await sleep(hadError ? 5 * 60_000 : 30_000);
  }
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (entryPath === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`intake: ${message}\n`);
    process.exitCode = 1;
  });
}
