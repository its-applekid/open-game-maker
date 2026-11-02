import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { createBlocklistLoader, parseBlocklist } from '../../src/boundary/blocklist.js';

describe('blocklist loader', () => {
  it('parses the sha256 column and ignores comments and malformed rows', () => {
    const first = 'a'.repeat(64);
    const second = 'b'.repeat(64);
    expect(parseBlocklist(`# generated\n${first}  12  a.bin\nnot-a-hash  4  no\n${second}  9  b.bin\n`)).toEqual(
      new Set([first, second]),
    );
  });

  it('reloads when the file changes and warns once while unavailable', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ogm-boundary-'));
    const path = join(directory, 'blocklist.txt');
    const warn = vi.fn();
    const loader = createBlocklistLoader(path, warn);

    await expect(loader.load()).resolves.toBeNull();
    await expect(loader.load()).resolves.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);

    const first = 'a'.repeat(64);
    await writeFile(path, `${first}  1  a\n`);
    await expect(loader.load()).resolves.toEqual(new Set([first]));

    const second = 'b'.repeat(64);
    await writeFile(path, `${second}  1  b\n`);
    await expect(loader.load()).resolves.toEqual(new Set([second]));
  });
});
