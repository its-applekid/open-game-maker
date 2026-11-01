import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openDb } from '../src/open.js';

const dirs: string[] = [];
function tempPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ogm-db-'));
  dirs.push(dir);
  return join(dir, 'nested', 'ogm.sqlite3');
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('openDb', () => {
  it('opens a file database in WAL mode with foreign keys and a busy timeout', () => {
    const { sqlite } = openDb(tempPath());
    expect(sqlite.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(sqlite.pragma('busy_timeout', { simple: true })).toBe(5000);
    sqlite.close();
  });

  it('creates the database file private to the owner', () => {
    const path = tempPath();
    openDb(path).sqlite.close();
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it('opens an in-memory database for tests', () => {
    const { sqlite } = openDb(':memory:');
    expect(sqlite.pragma('journal_mode', { simple: true })).toBe('memory');
    sqlite.close();
  });
});
