import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

export type JobStatus = 'blocked' | 'duplicate' | 'imported' | 'awaiting-license';

export type DoneJob = {
  drop_id: string;
  status: JobStatus;
  collection: string | null;
  at: string;
  fingerprint: string;
};

export type IntakeStatus = {
  updated: string;
  open: number;
  counts: Partial<Record<JobStatus, number>>;
  done: DoneJob[];
  last_error: string | null;
};

export function emptyStatus(): IntakeStatus {
  return { updated: new Date(0).toISOString(), open: 0, counts: {}, done: [], last_error: null };
}

export async function readStatus(path: string): Promise<IntakeStatus> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as IntakeStatus;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyStatus();
    throw error;
  }
}

export function countsFor(done: DoneJob[]): IntakeStatus['counts'] {
  const counts: IntakeStatus['counts'] = {};
  for (const job of done) counts[job.status] = (counts[job.status] ?? 0) + 1;
  return counts;
}

export async function writeStatus(path: string, status: IntakeStatus): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${randomBytes(5).toString('hex')}.tmp`);
  await writeFile(temporary, `${JSON.stringify(status, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, path);
}
