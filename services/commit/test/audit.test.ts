import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { JsonlAuditWriter } from '../src/audit.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe('JsonlAuditWriter', () => {
  it('appends mode-0600 JSON lines', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ogm-commit-audit-'));
    temporaryDirectories.push(directory);
    const audit = new JsonlAuditWriter(directory);
    const entry = {
      at: '2026-11-01T00:00:00.000Z',
      op: 'release' as const,
      gameId: 'game-1',
      repo: 'alice/gm-game-1',
      result: 'allowed' as const,
      sha: 'abc',
      actor: 'api' as const,
    };
    await audit.append(entry);
    await audit.append(entry);
    const file = path.join(directory, 'commit', 'audit.jsonl');
    const lines = (await readFile(file, 'utf8')).trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0] ?? '')).toEqual(entry);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
  });
});
