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
    expect(
      evaluateDiff(input({ files: [file('assets/model.glb', { binary: true, content: undefined })] })),
    ).toMatchObject({
      allowed: false,
      reasons: [expect.objectContaining({ code: 'rights', path: 'assets/model.glb' })],
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
    id: 't1:kenney-dungeon/barrel@1.0',
    sha256: cleanSha,
    path: 'assets/props/barrel.glb',
    source: 'vendored',
    license: 'CC0-1.0',
    rights: {
      uses: ['in-game'],
      audience: 'public',
      redistribution: 'free',
      attribution: null,
    },
    added: '2026-11-01',
  };
  const synty: LockEntry = {
    id: 't1:synty-polygon-dungeon/barrel@1.0',
    sha256: 'a'.repeat(64),
    path: 'Models/SM_Prop_Barrel.glb',
    source: 'library',
    license: 'LicenseRef-Synty',
    rights: {
      uses: ['in-game'],
      audience: 'private',
      redistribution: 'in-build',
      attribution: null,
    },
    added: '2026-11-01',
  };

  it('requires changed asset bytes to match the lock hash', () => {
    const verdict = evaluateDiff(
      input({ files: [file(asset.path, { sha256: 'f'.repeat(64) })], lockfile: lock([asset]) }),
    );
    expect(verdict.reasons).toContainEqual(
      expect.objectContaining({ code: 'rights', path: asset.path, detail: expect.stringContaining('sha256') }),
    );
  });

  it('allows placeholders only on draft diffs', () => {
    const placeholder = { ...asset, rights: { ...asset.rights, uses: ['placeholder' as const] } };
    const files = [file(asset.path)];
    expect(evaluateDiff(input({ files, lockfile: lock([placeholder]) }))).toEqual({ allowed: true, reasons: [] });
    expect(codes(evaluateTree(input({ draft: false, files, lockfile: lock([placeholder]) })))).toContain('rights');
  });

  it('allows a referenced private Synty asset in a private tree and rejects it when public', () => {
    // Library entries carry no repo file, so the tree has only the lock; their rights still gate publication.
    const files = [file('assets.lock.json')];
    expect(evaluateTree(input({ draft: false, files, lockfile: lock([synty]) }))).toEqual({
      allowed: true,
      reasons: [],
    });
    const publicVerdict = evaluateTree(input({ draft: false, visibility: 'public', files, lockfile: lock([synty]) }));
    expect(publicVerdict.reasons).toContainEqual(
      expect.objectContaining({ code: 'rights', path: synty.path, detail: expect.stringContaining(synty.id) }),
    );
  });

  it('treats vendored companions as locked repo files and reports a missing one', () => {
    const companion = { path: 'assets/props/colormap.png', sha256: cleanSha };
    const vendored = { ...asset, source: 'vendored' as const, files: [companion] };
    expect(
      evaluateTree(
        input({ draft: false, files: [file(asset.path), file(companion.path)], lockfile: lock([vendored]) }),
      ),
    ).toEqual({ allowed: true, reasons: [] });
    const changedCompanion = [file(asset.path), file(companion.path, { sha256: 'f'.repeat(64) })];
    expect(evaluateDiff(input({ files: changedCompanion, lockfile: lock([vendored]) })).reasons).toEqual([
      expect.objectContaining({ path: companion.path, detail: expect.stringContaining('sha256') }),
    ]);
    expect(
      evaluateTree(input({ draft: false, files: [file(asset.path)], lockfile: lock([vendored]) })).reasons,
    ).toEqual([
      expect.objectContaining({
        path: companion.path,
        detail: expect.stringContaining('locked asset file is missing'),
      }),
    ]);
  });
});

describe('vendored rule', () => {
  const cc0: LockEntry = {
    id: 't1:kenney-dungeon/barrel@1.0',
    sha256: 'c'.repeat(64),
    path: 'assets/props/barrel.glb',
    source: 'vendored',
    license: 'CC0-1.0',
    rights: { uses: ['in-game'], audience: 'public', redistribution: 'free', attribution: null },
    added: '2026-11-01',
  };
  const png = (path: string, overrides: Partial<BoundaryFile> = {}): BoundaryFile =>
    file(path, { binary: true, bytes: 4096, content: undefined, ...overrides });

  it('refuses a stray PNG in assets/ naming the file, the rule and the fix', () => {
    expect(evaluateDiff(input({ files: [png('assets/stray.png')] }))).toEqual({
      allowed: false,
      reasons: [
        {
          code: 'rights',
          path: 'assets/stray.png',
          detail: expect.stringMatching(/reference assets.*Try: gm assets register$/u),
        },
      ],
    });
  });

  it('refuses a stray PNG in assets/ even without a lock', () => {
    expect(evaluateDiff(input({ lockfile: null, files: [png('assets/stray.png')] })).reasons).toEqual([
      expect.objectContaining({ code: 'rights', path: 'assets/stray.png', detail: expect.stringContaining('Try:') }),
    ]);
  });

  it('passes a vendored CC0 file', () => {
    const files = [png(cc0.path, { sha256: cc0.sha256 }), file('assets.lock.json')];
    expect(evaluateDiff(input({ files, lockfile: lock([cc0]) }))).toEqual({ allowed: true, reasons: [] });
    expect(evaluateTree(input({ draft: false, visibility: 'public', files, lockfile: lock([cc0]) }))).toEqual({
      allowed: true,
      reasons: [],
    });
  });

  it('passes a hash-matching legacy vendored entry without source', () => {
    const legacy = { ...cc0, source: undefined };
    const files = [png(legacy.path, { sha256: legacy.sha256 })];

    expect(evaluateDiff(input({ files, lockfile: lock([legacy]) }))).toEqual({ allowed: true, reasons: [] });
  });

  it('passes a vendored companion file matched by its files[] sha', () => {
    const textureSha = 'd'.repeat(64);
    const entry = { ...cc0, files: [{ path: 'assets/props/barrel.png', sha256: textureSha }] };
    const files = [png(cc0.path, { sha256: cc0.sha256 }), png('assets/props/barrel.png', { sha256: textureSha })];
    expect(evaluateDiff(input({ files, lockfile: lock([entry]) }))).toEqual({ allowed: true, reasons: [] });
  });

  it('points a redistributable library entry at gm assets vendor', () => {
    const library = { ...cc0, source: 'library' };
    expect(
      evaluateDiff(input({ files: [png(cc0.path, { sha256: cc0.sha256 })], lockfile: lock([library]) })).reasons,
    ).toEqual([
      expect.objectContaining({ path: cc0.path, detail: expect.stringContaining(`Try: gm assets vendor ${cc0.id}`) }),
    ]);
  });

  it('refuses a locked file whose rights do not allow redistribution, even marked vendored', () => {
    const synty = {
      ...cc0,
      id: 't1:synty-polygon-dungeon/barrel@1.0',
      rights: { ...cc0.rights, redistribution: 'in-build' as const },
    };
    const [reason] = evaluateDiff(
      input({ files: [png(cc0.path, { sha256: cc0.sha256 })], lockfile: lock([synty]) }),
    ).reasons;
    expect(reason).toMatchObject({ code: 'rights', path: cc0.path, detail: expect.stringContaining('redistribution') });
    expect(reason?.detail).not.toContain('gm assets vendor');
  });

  it('refuses a large binary outside assets/ and allows a small one', () => {
    const large = png('public/sprites/hero.png', { bytes: 32 * 1024 + 1 });
    expect(evaluateDiff(input({ files: [large] })).reasons).toEqual([
      expect.objectContaining({ code: 'rights', path: 'public/sprites/hero.png' }),
    ]);
    expect(evaluateDiff(input({ files: [png('public/favicon.ico', { bytes: 32 * 1024 })] }))).toEqual({
      allowed: true,
      reasons: [],
    });
  });

  it('ignores removed asset files', () => {
    expect(evaluateDiff(input({ files: [png('assets/old.png', { status: 'removed' })] }))).toEqual({
      allowed: true,
      reasons: [],
    });
  });
});

describe('game folder rule', () => {
  const gamePath = 'games/castle-game';

  it('allows a change anywhere inside the game folder', () => {
    const files = [
      file(`${gamePath}/index.html`),
      file(`${gamePath}/design/design.json`),
      file(`${gamePath}/packages/local/ui.ts`),
    ];
    expect(evaluateDiff(input({ files, gamePath }))).toEqual({ allowed: true, reasons: [] });
  });

  it("refuses a file in another game's folder", () => {
    const files = [file(`${gamePath}/index.html`), file('games/puzzle-game/index.html')];
    const [reason] = evaluateDiff(input({ files, gamePath })).reasons;
    expect(reason).toMatchObject({ code: 'path', path: 'games/puzzle-game/index.html' });
  });

  it('refuses a repository-root file such as a workflow or a package manifest', () => {
    const files = [file('.github/workflows/ci.yml'), file('package.json')];
    const flagged = evaluateDiff(input({ files, gamePath })).reasons.map(({ path }) => path);
    // The path rule also owns the workflow, so assert the game folder rule named both files rather than a count.
    expect(flagged).toContain('.github/workflows/ci.yml');
    expect(flagged).toContain('package.json');
  });

  it('refuses packages/ unless the change is an approved promotion', () => {
    const files = [file('packages/shared/ui.ts')];
    expect(codes(evaluateDiff(input({ files, gamePath })))).toEqual(['path']);
    expect(evaluateDiff(input({ files, gamePath, promotion: true }))).toEqual({ allowed: true, reasons: [] });
  });

  it('leaves a change with no game folder to the repository-wide rules', () => {
    expect(evaluateDiff(input({ files: [file('docs/ops/self-host.md')] }))).toEqual({ allowed: true, reasons: [] });
  });
});
