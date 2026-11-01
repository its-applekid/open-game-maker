import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Branch, DesignDoc } from '@ogm/contracts';
import { schema } from '@ogm/db';
import { afterEach, describe, expect, it } from 'vitest';

import { FsBaseDocSource, MemoryBaseDocSource } from '../src/design/base-doc.js';
import { snapshotAt } from '../src/design/snapshot.js';
import { appendTransaction, ensureMainBranch, insertBranch } from '../src/design/store.js';
import { makeDeps } from './helpers.js';

const ids = {
  family: 'f_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  game: 'g_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  owner: 'u_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  build: 'build_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  main: 'b_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  child: 'b_01BX5ZZKBKACTAV9WEVGEMMVRZ',
} as const;

const now = new Date('2026-11-01T16:00:00.000Z');
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function baseDoc(gravity = 1): DesignDoc {
  return { schemaVersion: 1, globals: { gravity }, entities: {} };
}

function setup() {
  const deps = makeDeps();
  deps.db
    .insert(schema.families)
    .values({ id: ids.family, name: 'Family', ownerUserId: ids.owner, createdAt: now.toISOString() })
    .run();
  deps.db
    .insert(schema.games)
    .values({
      id: ids.game,
      familyId: ids.family,
      ownerId: ids.owner,
      title: 'Game',
      visibility: 'private',
      repoVisibility: 'private',
      createdAt: now.toISOString(),
    })
    .run();
  const branch = ensureMainBranch(deps.sqlite, ids.game, { id: ids.main, now });
  return { deps, branch };
}

function appendGravity(sqlite: ReturnType<typeof makeDeps>['sqlite'], branch: Branch, rev: number, value: number) {
  return appendTransaction(
    sqlite,
    {
      gameId: ids.game,
      branchId: branch.id,
      baseRev: rev - 1,
      leaseToken: 0,
      actor: ids.owner,
      kind: 'system',
      label: `gravity ${value}`,
      baseBuildId: ids.build,
      commands: [],
      patches: [{ op: 'replace', path: ['globals', 'gravity'], value }],
      inverse: [{ op: 'replace', path: ['globals', 'gravity'], value: value - 1 }],
    },
    { now: new Date(now.getTime() + rev) },
  );
}

describe('snapshotAt', () => {
  it('returns the replayed document at the requested revision and caps at head', async () => {
    const { deps, branch } = setup();
    deps.db.update(schema.branches).set({ latestBuildId: ids.build }).run();
    for (let rev = 1; rev <= 5; rev += 1) appendGravity(deps.sqlite, branch, rev, rev + 1);
    const source = new MemoryBaseDocSource().set(ids.game, ids.build, baseDoc());

    await expect(snapshotAt(deps.sqlite, source, branch.id, 3)).resolves.toEqual({
      rev: 3,
      buildId: ids.build,
      doc: baseDoc(4),
    });
    await expect(snapshotAt(deps.sqlite, source, branch.id, 99)).resolves.toEqual({
      rev: 5,
      buildId: ids.build,
      doc: baseDoc(6),
    });
  });

  it('replays a child from its fork point without later parent revisions', async () => {
    const { deps, branch } = setup();
    for (let rev = 1; rev <= 5; rev += 1) appendGravity(deps.sqlite, branch, rev, rev);
    const child = insertBranch(deps.sqlite, {
      id: ids.child,
      gameId: ids.game,
      name: 'experiment',
      gitRef: 'refs/heads/experiment',
      forkPoint: { parentBranchId: ids.main, parentRev: 3, gitSha: 'a'.repeat(40) },
      headRev: 0,
      latestBuildId: null,
      status: 'active',
      createdBy: ids.owner,
      createdAt: now.toISOString(),
    });
    appendGravity(deps.sqlite, child, 1, 30);

    await expect(snapshotAt(deps.sqlite, new MemoryBaseDocSource(), child.id)).resolves.toEqual({
      rev: 1,
      buildId: null,
      doc: baseDoc(30),
    });
  });

  it('uses the empty design document when the branch has no build', async () => {
    const { deps, branch } = setup();
    await expect(snapshotAt(deps.sqlite, new MemoryBaseDocSource(), branch.id)).resolves.toEqual({
      rev: 0,
      buildId: null,
      doc: { schemaVersion: 1, globals: {}, entities: {} },
    });
  });
});

describe('FsBaseDocSource', () => {
  it('loads design and manifest JSON from the games-host build tree', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ogm-design-base-'));
    roots.push(root);
    const build = join(root, ids.game, ids.build);
    mkdirSync(join(build, 'design'), { recursive: true });
    writeFileSync(join(build, 'design', 'design.json'), JSON.stringify(baseDoc(9)));
    writeFileSync(
      join(build, 'manifest.json'),
      JSON.stringify({
        id: 'game',
        sdk: '^1.0.0',
        title: 'Game',
        inputs: { actions: {} },
        presentation: { orientation: 'any', minLogical: { w: 320, h: 180 }, fit: 'responsive' },
        view: 'topdown',
        dimension: '2d',
        capabilities: [],
        palette: { categories: [], items: [] },
        tools: [],
        gizmos: {},
        saves: false,
        overrides: { aliases: {}, retired: [] },
      }),
    );
    const source = new FsBaseDocSource(root);

    await expect(source.load(ids.game, ids.build)).resolves.toEqual(baseDoc(9));
    await expect(source.manifest(ids.game, ids.build)).resolves.toMatchObject({ id: 'game', title: 'Game' });
  });
});
