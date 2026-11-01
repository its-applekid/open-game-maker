import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { loadOrCreateVapid } from '../src/notify/vapid.js';

const directories: string[] = [];

function tempDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'ogm-vapid-'));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    chmodSync(directory, 0o700);
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('loadOrCreateVapid', () => {
  it('creates private key material once with private directory and file modes', () => {
    const parent = tempDirectory();
    const directory = join(parent, 'private');
    const path = join(directory, 'ogm-api.vapid.json');
    const first = loadOrCreateVapid(path, 'mailto:operator@example.test');
    const second = loadOrCreateVapid(path, 'mailto:operator@example.test');

    expect(second.publicKey).toBe(first.publicKey);
    expect(statSync(directory).mode & 0o777).toBe(0o700);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({ publicKey: first.publicKey });
  });

  it('names a malformed file without exposing its contents', () => {
    const path = join(tempDirectory(), 'broken.vapid.json');
    writeFileSync(path, 'private-key-material-that-must-not-be-logged', { mode: 0o600 });

    let error: unknown;
    try {
      loadOrCreateVapid(path, 'mailto:operator@example.test');
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(path);
    expect((error as Error).message).not.toContain('private-key-material');
  });
});
