import { closeSync, constants, fstatSync, openSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

import { z } from 'zod';

import { IsoTime } from '@ogm/contracts';

import type { IntakeDrop } from './shapes.js';

// The Drive intake files (T05 §4): `queue.jsonl` lines from `scripts/drive-sync/drive_sync.py`, and the
// `manifest.json` / `intake.json` pair in each drop's quarantine folder. All of it is untrusted input.
const QueueLine = z
  .object({
    drop_id: z.string().min(1),
    name: z.string(),
    manifest: z.string().min(1),
    queued_at: IsoTime.optional(),
    time: IsoTime.optional(),
  })
  .refine((line) => line.queued_at !== undefined || line.time !== undefined);
const IntakeRecord = z.object({
  status: z.enum(['imported', 'awaiting-license', 'blocked', 'duplicate']),
  collection: z.string().nullish(),
  license: z.union([z.string(), z.object({ id: z.string() }).passthrough()]).nullish(),
  usage_rights: z.object({ confirmed_by: z.string().nullish() }).passthrough().nullish(),
  confirmed_by: z.string().nullish(),
  date: z.string().nullish(),
});
const Manifest = z.object({ problems: z.array(z.unknown()).default([]) });

export type IntakeStatus = { drops: IntakeDrop[]; parseErrors: number };

type FileResult<T> = { kind: 'missing' } | { kind: 'invalid' } | { kind: 'ok'; value: T };

function readText(realRoot: string, path: string): FileResult<string> {
  let fd: number;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT' ? { kind: 'missing' } : { kind: 'invalid' };
  }
  let result: FileResult<string>;
  try {
    const opened = readlinkSync(`/proc/self/fd/${fd}`);
    result =
      isUnder(opened, realRoot) && fstatSync(fd).isFile()
        ? { kind: 'ok', value: readFileSync(fd, 'utf8') }
        : { kind: 'invalid' };
  } catch {
    result = { kind: 'invalid' };
  }
  try {
    closeSync(fd);
  } catch {
    return { kind: 'invalid' };
  }
  return result;
}

function readJson<S extends z.ZodType>(realRoot: string, path: string, schema: S): FileResult<z.output<S>> {
  const text = readText(realRoot, path);
  if (text.kind !== 'ok') return text;
  try {
    const parsed = schema.safeParse(JSON.parse(text.value));
    return parsed.success ? { kind: 'ok', value: parsed.data } : { kind: 'invalid' };
  } catch {
    return { kind: 'invalid' };
  }
}

function realpathOrNull(path: string): string | null {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
}

const isUnder = (path: string, root: string) => path === root || path.startsWith(root + sep);

// The drop's quarantine folder, or `null` when its `manifest` path escapes the intake dir (lexically or by symlink).
function dropFolder(realRoot: string, manifest: string): string | null {
  const folder = dirname(resolve(realRoot, manifest));
  if (!isUnder(folder, realRoot)) return null;
  const real = realpathOrNull(folder);
  if (real === null) return folder;
  return isUnder(real, realRoot) ? real : null;
}

// Never throws and never writes: a missing directory or queue is an empty list, and every bad line,
// bad file or escaping path is skipped and counted in `parseErrors`.
export function readIntake(dir: string | undefined): IntakeStatus {
  const empty: IntakeStatus = { drops: [], parseErrors: 0 };
  if (!dir) return empty;
  const realRoot = realpathOrNull(dir);
  if (realRoot === null) return empty;
  let queue: string;
  try {
    const queueFile = readText(realRoot, join(realRoot, 'queue.jsonl'));
    if (queueFile.kind === 'invalid') return { drops: [], parseErrors: 1 };
    if (queueFile.kind === 'missing') return empty;
    queue = queueFile.value;
  } catch {
    return empty;
  }

  const drops: IntakeDrop[] = [];
  let parseErrors = 0;
  for (const raw of queue.split('\n')) {
    if (raw.trim() === '') continue;
    let line: z.output<typeof QueueLine>;
    try {
      const parsed = QueueLine.safeParse(JSON.parse(raw));
      if (!parsed.success) throw parsed.error;
      line = parsed.data;
    } catch {
      parseErrors += 1;
      continue;
    }
    const folder = dropFolder(realRoot, line.manifest);
    if (folder === null) {
      parseErrors += 1;
      continue;
    }

    const intake = readJson(realRoot, join(folder, 'intake.json'), IntakeRecord);
    const manifest = readJson(realRoot, join(folder, 'manifest.json'), Manifest);
    if (intake.kind === 'invalid') parseErrors += 1;
    if (manifest.kind === 'invalid') parseErrors += 1;
    const record = intake.kind === 'ok' ? intake.value : null;
    const license = record?.license;
    drops.push({
      dropId: line.drop_id,
      name: line.name,
      time: (line.queued_at ?? line.time)!,
      status: record?.status ?? 'queued',
      collection: record?.collection ?? null,
      license: typeof license === 'string' ? license : (license?.id ?? null),
      confirmedBy: record?.confirmed_by ?? record?.usage_rights?.confirmed_by ?? null,
      date: record?.date ?? null,
      problems: manifest.kind === 'ok' ? manifest.value.problems.length : 0,
    });
  }
  drops.sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
  return { drops, parseErrors };
}
