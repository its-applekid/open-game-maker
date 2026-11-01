import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { readPrivateKey } from '../src/auth/private-key.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

async function keyFile(mode: number): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ogm-commit-key-'));
  temporaryDirectories.push(directory);
  const file = path.join(directory, 'app.pem');
  await writeFile(file, 'private-key', { mode });
  await chmod(file, mode);
  return file;
}

describe('readPrivateKey', () => {
  it('reads a mode-0600 key', async () => {
    await expect(readPrivateKey(await keyFile(0o600))).resolves.toBe('private-key');
  });

  it.each([0o400, 0o640, 0o644])('refuses mode %s', async (mode) => {
    await expect(readPrivateKey(await keyFile(mode))).rejects.toThrow('mode 0600');
  });
});
