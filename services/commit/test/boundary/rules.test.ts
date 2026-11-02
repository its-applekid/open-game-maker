import { describe, expect, it } from 'vitest';

import type { AssetsLock, LockEntry } from '@ogm/contracts';

import { evaluateDiff, evaluateTree, type BoundaryFile, type BoundaryInput } from '../../src/boundary/index.js';

const cleanSha = '0'.repeat(64);

function lock(entries: LockEntry[] = []): AssetsLock {
  return { version: 1, family: 'any', pov: 'iso', assets: entries };
}

function file(path: string, overrides: Partial<BoundaryFile> = {}): BoundaryFile {
  return {
    path,
    status: 'added',
    bytes: 1,
    sha256: cleanSha,
    binary: false,
    content: 'ok\n',
    ...overrides,
  };
}

function input(overrides: Partial<Omit<BoundaryInput, 'mode'>> = {}): Omit<BoundaryInput, 'mode'> {
  return {
    actor: 'agent',
    blocklist: new Set(),
    draft: true,
    files: [],
    lockfile: lock(),
    profileNames: [],
    visibility: 'private',
    ...overrides,
  };
}

function codes(verdict: ReturnType<typeof evaluateDiff>): string[] {
  return verdict.reasons.map(({ code }) => code);
}

describe('path rule', () => {
  it('denies workflow edits except platform refreshes', () => {
    const files = [file('.github/workflows/x.yml')];
    expect(codes(evaluateDiff(input({ files })))).toContain('path');
    expect(evaluateDiff(input({ actor: 'platform', files }))).toEqual({ allowed: true, reasons: [] });
  });

  it.each(['.gm/context.json', 'assets-local/source.glb', '.env.local', 'keys/site.pem', 'node_modules/x.js'])(
    'denies reserved path %s',
    (path) => expect(codes(evaluateDiff(input({ files: [file(path)] })))).toContain('path'),
  );

  it('denies traversal, escaping symlinks, emails, and profile names in file names', () => {
    const verdict = evaluateDiff(
      input({
        profileNames: ['Alice Example'],
        files: [
          file('assets/../../etc/passwd'),
          file('links/out', { mode: '120000', content: '../../outside' }),
          file('notes/alice@example.com.txt'),
          file('notes/Alice Example.txt'),
        ],
      }),
    );

    expect(verdict.reasons.filter(({ code }) => code === 'path')).toHaveLength(4);
  });
});

describe('size rule', () => {
  it('denies a file over 25 MiB and a diff over 200 MiB', () => {
    const overFile = file('assets/large.glb', { bytes: 25 * 1024 * 1024 + 1, binary: true, content: undefined });
    expect(codes(evaluateDiff(input({ files: [overFile] })))).toContain('size');

    const files = Array.from({ length: 9 }, (_, index) =>
      file(`assets/${index}.glb`, { bytes: 25 * 1024 * 1024, binary: true, content: undefined }),
    );
    expect(evaluateDiff(input({ files })).reasons).toContainEqual(
      expect.objectContaining({ code: 'size', detail: 'pull request adds more than 200 MiB' }),
    );
  });

  it('allows manifest binary formats and denies other binary files', () => {
    expect(evaluateDiff(input({ files: [file('assets/model.glb', { binary: true, content: undefined })] }))).toEqual({
      allowed: false,
      reasons: [{ code: 'rights', path: 'assets/model.glb', detail: 'asset is not listed in assets.lock.json' }],
    });
    expect(evaluateDiff(input({ files: [file('bin/game.exe', { binary: true, content: undefined })] }))).toMatchObject({
      allowed: false,
      reasons: [expect.objectContaining({ code: 'size', path: 'bin/game.exe' })],
    });
  });

  it('denies source maps only on public repositories', () => {
    const files = [file('dist/game.js.map')];
    expect(codes(evaluateDiff(input({ visibility: 'public', files })))).toContain('size');
    expect(evaluateDiff(input({ files }))).toEqual({ allowed: true, reasons: [] });
  });
});

describe('secret rule', () => {
  it('reports a token class and path without quoting the token', () => {
    const token = 'ghp_abcdefghijklmnopqrstuvwxyz123456';
    const verdict = evaluateDiff(input({ files: [file('README.md', { content: `token=${token}\n` })] }));
    const reason = verdict.reasons.find(({ code }) => code === 'secret');

    expect(reason).toMatchObject({ code: 'secret', path: 'README.md' });
    expect(reason?.detail).toContain('token-like string');
    expect(reason?.detail).not.toContain(token);
  });

  it('detects high entropy strings but ignores declared sha256 values', () => {
    const entropy = 'aB3dE5gH7jK9mN2pQ4rS6tV8xY0z+/=_';
    expect(
      codes(evaluateDiff(input({ files: [file('src/config.ts', { content: `const value = '${entropy}';\n` })] }))),
    ).toContain('secret');
    expect(
      evaluateDiff(input({ files: [file('assets.lock.json', { content: `{"sha256":"${'a'.repeat(64)}"}\n` })] })),
    ).toEqual({ allowed: true, reasons: [] });
  });
});

describe('pii rule', () => {
  it('detects profile terms, email, phone, and street addresses without quoting matches', () => {
    const verdict = evaluateDiff(
      input({
        profileNames: ['Alice Example'],
        files: [
          file('credits.md', { content: 'Alice Example\nalice@example.com\n+1 (415) 555-1212\n123 Main Street\n' }),
        ],
      }),
    );
    const reasons = verdict.reasons.filter(({ code }) => code === 'pii');

    expect(reasons).toHaveLength(4);
    expect(reasons.every(({ detail }) => !detail.includes('Alice') && !detail.includes('alice@'))).toBe(true);
  });
});

describe('denylist rule', () => {
  it('denies blocklisted bytes and public agent artifacts', () => {
    const blockedSha = 'f'.repeat(64);
    const verdict = evaluateDiff(
      input({
        visibility: 'public',
        blocklist: new Set([blockedSha]),
        files: [file('assets/blocked.glb', { sha256: blockedSha }), file('run.workpad.md')],
      }),
    );

    expect(verdict.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'denylist', path: 'assets/blocked.glb' }),
        expect.objectContaining({ code: 'denylist', path: 'run.workpad.md', detail: 'agent artifact' }),
      ]),
    );
  });

  it('fails closed for a missing public blocklist and permits a missing private blocklist', () => {
    expect(evaluateDiff(input({ visibility: 'public', blocklist: null }))).toMatchObject({
      allowed: false,
      reasons: [expect.objectContaining({ code: 'denylist', detail: 'blocklist unavailable' })],
    });
    expect(evaluateDiff(input({ blocklist: null }))).toEqual({ allowed: true, reasons: [] });
  });
});

describe('rights rule', () => {
  const asset: LockEntry = {
    id: 't1:synty-polygon-dungeon/barrel@1.0',
    sha256: cleanSha,
    path: 'assets/props/barrel.glb',
    license: 'LicenseRef-Synty',
    rights: {
      uses: ['in-game'],
      audience: 'private',
      redistribution: 'in-build',
      attribution: null,
    },
    added: '2026-11-01',
  };

  it('requires changed assets to be present in the lock', () => {
    expect(evaluateDiff(input({ files: [file('assets/new.glb')] }))).toMatchObject({
      allowed: false,
      reasons: [expect.objectContaining({ code: 'rights', path: 'assets/new.glb' })],
    });
  });

  it('allows placeholders only on draft diffs', () => {
    const placeholder = { ...asset, rights: { ...asset.rights, uses: ['placeholder' as const] } };
    const files = [file(asset.path)];
    expect(evaluateDiff(input({ files, lockfile: lock([placeholder]) }))).toEqual({ allowed: true, reasons: [] });
    expect(codes(evaluateTree(input({ draft: false, files, lockfile: lock([placeholder]) })))).toContain('rights');
  });

  it('allows a private Synty tree and rejects the same tree when public', () => {
    const files = [file(asset.path)];
    expect(evaluateTree(input({ draft: false, files, lockfile: lock([asset]) }))).toEqual({
      allowed: true,
      reasons: [],
    });
    const publicVerdict = evaluateTree(input({ draft: false, visibility: 'public', files, lockfile: lock([asset]) }));
    expect(publicVerdict.reasons).toContainEqual(
      expect.objectContaining({
        code: 'rights',
        path: asset.path,
        detail: expect.stringContaining(asset.id),
      }),
    );
  });
});
