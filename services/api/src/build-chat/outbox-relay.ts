import { constants, watch, type FSWatcher } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { AgentOutboxLine } from '@ogm/contracts';
import type { Sqlite } from '@ogm/db';
import { ZodError } from 'zod';

import type { ChatJobDirectory } from '../app/registry.js';
import type { LogLine } from '../app/types.js';
import { MediaError } from './media.js';
import type { OutboxContext, OutboxHandler } from './outbox-handlers.js';

export const MAX_LINE_BYTES = 64 * 1024;
const READ_CHUNK = 4 * 1024 * 1024;
const MAX_DEPTH = 6;
const SKIP_DIRS = new Set(['node_modules', '.git']);

export type RelayDeps = {
  root: string;
  sqlite: Sqlite;
  handlers: Map<string, OutboxHandler>;
  jobs: () => ChatJobDirectory | null;
  context: (jobId: string, workspaceRoot: string) => OutboxContext;
  log: (line: LogLine) => void;
};

// The job a workspace first wrote for. OGM-082 reads it to find where to write inbox files.
export function workspaceForJob(sqlite: Sqlite, jobId: string): string | null {
  const row = sqlite
    .prepare(
      'SELECT workspace_root AS root FROM build_chat_workspaces WHERE job_id = ? ORDER BY pinned_at DESC LIMIT 1',
    )
    .get(jobId) as { root: string } | undefined;
  return row?.root ?? null;
}

// Ships `<workspace>/.gm/outbox/*.jsonl` lines (written inside the no-network sandbox) to their handlers. Offsets live
// in SQLite, so a restart resumes where it stopped; a line is consumed once whether it is stored or rejected, and
// handlers are idempotent on the line id. A trailing partial line waits for its newline.
export function createOutboxRelay(deps: RelayDeps) {
  const watchers = new Map<string, FSWatcher>();
  const unhandledTypes = new Set<string>();
  let timer: NodeJS.Timeout | null = null;
  let running: Promise<void> | null = null;
  let again = false;

  const getOffset = deps.sqlite.prepare('SELECT offset FROM build_chat_outbox_offsets WHERE path = ?');
  const setOffset = deps.sqlite.prepare(
    `INSERT INTO build_chat_outbox_offsets (path, offset, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(path) DO UPDATE SET offset = excluded.offset, updated_at = excluded.updated_at`,
  );
  const getPin = deps.sqlite.prepare('SELECT job_id AS jobId FROM build_chat_workspaces WHERE workspace_root = ?');
  const setPin = deps.sqlite.prepare(
    'INSERT OR IGNORE INTO build_chat_workspaces (workspace_root, job_id, pinned_at) VALUES (?, ?, ?)',
  );

  const reject = (file: string, offset: number, reason: string) =>
    deps.log({ event: 'outbox-line-rejected', file, offset, reason });

  async function findOutboxDirs(directory: string, depth: number, found: string[]): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.some((entry) => entry.isDirectory() && entry.name === '.gm')) {
      found.push(join(directory, '.gm', 'outbox'));
      return;
    }
    if (depth >= MAX_DEPTH) return;
    for (const entry of entries) {
      if (entry.isDirectory() && !SKIP_DIRS.has(entry.name))
        await findOutboxDirs(join(directory, entry.name), depth + 1, found);
    }
  }

  async function processLine(file: string, offset: number, bytes: Buffer): Promise<void> {
    if (bytes.length > MAX_LINE_BYTES) return reject(file, offset, 'line_too_large');
    const raw = bytes.toString('utf8').trim();
    if (raw.length === 0) return;
    let parsed;
    try {
      parsed = AgentOutboxLine.safeParse(JSON.parse(raw));
    } catch {
      return reject(file, offset, 'line_not_json');
    }
    if (!parsed.success) return reject(file, offset, 'line_invalid');
    const line = parsed.data;

    const workspaceRoot = dirname(dirname(dirname(file)));
    const pinned = (getPin.get(workspaceRoot) as { jobId: string } | undefined)?.jobId;
    if (pinned !== undefined && pinned !== line.job_id) return reject(file, offset, 'job_mismatch');
    const job = await deps.jobs()?.get(line.job_id);
    if (!job) return reject(file, offset, 'job_unknown');
    if (pinned === undefined) setPin.run(workspaceRoot, line.job_id, new Date().toISOString());

    const handler = deps.handlers.get(line.type);
    if (!handler) {
      if (!unhandledTypes.has(line.type)) deps.log({ event: 'outbox-type-unhandled', type: line.type });
      unhandledTypes.add(line.type);
      return;
    }
    try {
      await handler.handle(line, deps.context(line.job_id, workspaceRoot));
    } catch (error) {
      const reason =
        error instanceof MediaError ? error.code : error instanceof ZodError ? 'payload_invalid' : 'handler_error';
      reject(file, offset, reason);
      if (reason === 'handler_error')
        deps.log({ event: 'outbox-handler-error', type: line.type, stack: (error as Error).stack });
    }
  }

  async function processFile(file: string): Promise<void> {
    let handle;
    try {
      handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    } catch {
      return;
    }
    try {
      const stats = await handle.stat();
      if (!stats.isFile()) return;
      let offset = (getOffset.get(file) as { offset: number } | undefined)?.offset ?? 0;
      if (stats.size < offset) offset = 0; // truncated or replaced: replay, handlers skip ids already stored
      while (offset < stats.size) {
        const length = Math.min(stats.size - offset, READ_CHUNK);
        const buffer = Buffer.alloc(length);
        const { bytesRead } = await handle.read(buffer, 0, length, offset);
        const chunk = buffer.subarray(0, bytesRead);
        let start = 0;
        for (let newline = chunk.indexOf(10); newline !== -1; newline = chunk.indexOf(10, start)) {
          await processLine(file, offset + start, chunk.subarray(start, newline));
          start = newline + 1;
          setOffset.run(file, offset + start, new Date().toISOString());
        }
        if (start === 0) {
          // No newline in a full chunk: the line is far over the limit. Drop the chunk; its tail fails to parse.
          if (bytesRead === READ_CHUNK) {
            reject(file, offset, 'line_too_large');
            setOffset.run(file, offset + bytesRead, new Date().toISOString());
            offset += bytesRead;
            continue;
          }
          return;
        }
        offset += start;
      }
    } finally {
      await handle.close();
    }
  }

  async function scanOnce(): Promise<void> {
    if (deps.jobs() === null) return; // nothing can be checked against a job yet; offsets stay put
    const dirs: string[] = [];
    await findOutboxDirs(deps.root, 0, dirs);
    for (const dir of dirs) {
      if (
        !(await lstat(dir).then(
          (stats) => stats.isDirectory(),
          () => false,
        ))
      )
        continue;
      if (timer && !watchers.has(dir)) {
        try {
          const watcher = watch(dir, () => void scan());
          watcher.on('error', () => {
            watcher.close();
            watchers.delete(dir);
          });
          watcher.unref();
          watchers.set(dir, watcher);
        } catch {
          // the rescan still covers this directory
        }
      }
      let files: string[];
      try {
        files = (await readdir(dir, { withFileTypes: true }))
          .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
          .map((entry) => join(dir, entry.name))
          .sort();
      } catch {
        continue;
      }
      for (const file of files) await processFile(file);
    }
  }

  // One pass at a time; a wake-up during a pass schedules exactly one more.
  function scan(): Promise<void> {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      try {
        do {
          again = false;
          await scanOnce();
        } while (again);
      } catch (error) {
        deps.log({ event: 'outbox-relay-error', stack: (error as Error).stack });
      } finally {
        running = null;
      }
    })();
    return running;
  }

  return {
    scan,
    start(rescanMs = 5000) {
      if (timer) return;
      timer = setInterval(() => void scan(), rescanMs);
      timer.unref();
      void scan();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      for (const watcher of watchers.values()) watcher.close();
      watchers.clear();
    },
  };
}
