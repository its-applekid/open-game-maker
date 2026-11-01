import type { BoundaryVerdict, Build, ChangeNote, Release } from '@ogm/contracts';
import { schema } from '@ogm/db';
import { fold, reduce } from '@ogm/design-log';
import { and, eq, isNull } from 'drizzle-orm';

import type { AppDeps } from '../app/types.js';
import type { BaseDocSource } from '../design/base-doc.js';
import { readChain } from '../design/store.js';
import type { CommitClient } from './commit-client.js';
import { stableId } from './id.js';
import type { RightsReason } from './rights.js';

type Changelog = { summary: string; items: ChangeNote[] };
type BuildRow = typeof schema.builds.$inferSelect;
type ReleaseRow = typeof schema.releases.$inferSelect;
type SnapshotRow = typeof schema.overrideSnapshots.$inferSelect;
type GameRow = typeof schema.games.$inferSelect;

export type VersionCounts = { publishCount: number; buildsSinceFork: number; txSinceLatestBuild: number };

export type ReleaseRuntime = {
  source: BaseDocSource;
  commit: CommitClient;
  checkRights: (artifactPath: string, visibility: 'public' | 'private') => Promise<RightsReason[]>;
  countSavesAboveSchema: (gameId: string, schemaVersion: number) => Promise<number | null>;
  deriveVersion: (counts: VersionCounts) => string;
  onBuildTested: (gameId: string, branchId: string, buildId: string) => Promise<void>;
  gamesOrigin: string;
  now: () => Date;
};

export class ReleaseError extends Error {
  constructor(
    readonly code: string,
    readonly status: 403 | 404 | 409 | 422 | 502,
    readonly payload?: { verdict: BoundaryVerdict } | { rights: RightsReason[] },
  ) {
    super(code);
    this.name = 'ReleaseError';
  }
}

function buildResponse(row: BuildRow): Build {
  return {
    id: row.id,
    gameId: row.gameId,
    branchId: row.branchId,
    gitSha: row.gitSha,
    ...(row.jobId ? { jobId: row.jobId } : {}),
    sdkVersion: row.sdkVersion,
    saveSchemaVersion: row.saveSchemaVersion,
    ...(row.migratesFromSchema === null ? {} : { migratesFromSchema: row.migratesFromSchema }),
    achievementCatalogHash: row.achievementCatalogHash,
    status: row.status,
    artifact: row.artifact,
    createdAt: row.createdAt,
  };
}

function releaseResponse(row: ReleaseRow): Release {
  return {
    id: row.id,
    gameId: row.gameId,
    seq: row.seq,
    version: row.version,
    buildId: row.buildId,
    snapshotId: row.snapshotId,
    gitTag: row.gitTag,
    kind: row.kind,
    ...(row.restoresReleaseId ? { restoresReleaseId: row.restoresReleaseId } : {}),
    ...(row.predecessorReleaseId ? { predecessorReleaseId: row.predecessorReleaseId } : {}),
    changelog: JSON.parse(row.changelogJson) as Changelog,
    publishedBy: row.publishedBy,
    publishedAt: row.publishedAt,
  };
}

function requireBuild(deps: AppDeps, gameId: string, buildId: string): BuildRow {
  const build = deps.db
    .select()
    .from(schema.builds)
    .where(and(eq(schema.builds.id, buildId), eq(schema.builds.gameId, gameId)))
    .get();
  if (!build) throw new ReleaseError('build_not_found', 404);
  return build;
}

function requireMainBuild(deps: AppDeps, gameId: string, buildId: string): { build: BuildRow; game: GameRow } {
  const build = requireBuild(deps, gameId, buildId);
  if (build.status !== 'tested') throw new ReleaseError('not_tested', 409);
  const branch = deps.db.select().from(schema.branches).where(eq(schema.branches.id, build.branchId)).get();
  if (!branch || branch.name !== 'main') throw new ReleaseError('not_main', 409);
  const game = deps.db.select().from(schema.games).where(eq(schema.games.id, gameId)).get();
  if (!game) throw new ReleaseError('game_not_found', 404);
  return { build, game };
}

function counts(deps: AppDeps, gameId: string): VersionCounts {
  const publishCount =
    deps.sqlite
      .prepare<[string], { count: number }>('SELECT COUNT(*) AS count FROM releases WHERE game_id = ?')
      .get(gameId)?.count ?? 0;
  return { publishCount: publishCount + 1, buildsSinceFork: 0, txSinceLatestBuild: 0 };
}

function lintText(text: string): string {
  const unsafe = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|https?:\/\/\S+|(^|\s)@[A-Z0-9_]+\b/i;
  return unsafe.test(text) ? '(edited)' : text.trim();
}

function assembleChangelog(deps: AppDeps, gameId: string, predecessor: ReleaseRow | undefined): Changelog {
  const notes = deps.db
    .select()
    .from(schema.changeNotes)
    .where(and(eq(schema.changeNotes.gameId, gameId), isNull(schema.changeNotes.releaseId)))
    .all()
    .map((note) => ({
      ...(note.jobId ? { jobId: note.jobId } : {}),
      ...(note.txId ? { txId: note.txId } : {}),
      kind: note.kind,
      text: lintText(note.text),
    }));
  let afterRev = 0;
  if (predecessor) {
    afterRev =
      deps.db
        .select({ headRev: schema.overrideSnapshots.headRev })
        .from(schema.overrideSnapshots)
        .where(eq(schema.overrideSnapshots.id, predecessor.snapshotId))
        .get()?.headRev ?? 0;
  }
  const labels = deps.sqlite
    .prepare<[string, number], { id: string; label: string }>(
      `SELECT tx.id, tx.label FROM design_transactions tx
       JOIN branches b ON b.id = tx.branch_id
       WHERE tx.game_id = ? AND b.name = 'main' AND tx.kind = 'manual' AND tx.rev > ? ORDER BY tx.rev`,
    )
    .all(gameId, afterRev)
    .map(({ id, label }) => ({ txId: id, kind: 'change' as const, text: lintText(label) }));
  const seen = new Set<string>();
  const items = [...notes, ...labels].filter(({ text }) => {
    const key = text.trim().toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { summary: items[0]?.text ?? 'Updates', items };
}

function renderChangelog(changelog: Changelog): string {
  return `${changelog.summary}\n\n${changelog.items.map((item) => `- ${item.text}`).join('\n')}`.trim();
}

function sanitizeChangelog(changelog: Changelog): Changelog {
  return {
    summary: lintText(changelog.summary),
    items: changelog.items.map((item) => ({ ...item, text: lintText(item.text) })),
  };
}

export function registerBuild(
  deps: AppDeps,
  runtime: ReleaseRuntime,
  gameId: string,
  input: Omit<typeof schema.builds.$inferInsert, 'id' | 'gameId' | 'status' | 'artifact' | 'createdAt'> & {
    changeNotes?: ChangeNote[];
  },
): Build {
  const createdAt = runtime.now().toISOString();
  const build: typeof schema.builds.$inferInsert = {
    id: stableId('build', runtime.now()),
    gameId,
    branchId: input.branchId,
    gitSha: input.gitSha,
    jobId: input.jobId,
    sdkVersion: input.sdkVersion,
    saveSchemaVersion: input.saveSchemaVersion,
    migratesFromSchema: input.migratesFromSchema,
    achievementCatalogHash: input.achievementCatalogHash,
    status: 'building',
    artifact: 'present',
    artifactPath: input.artifactPath,
    createdAt,
  };
  deps.db.transaction((tx) => {
    tx.insert(schema.builds).values(build).run();
    if (input.changeNotes?.length) {
      tx.insert(schema.changeNotes)
        .values(
          input.changeNotes.map((note) => ({
            id: stableId('note', runtime.now()),
            gameId,
            jobId: note.jobId ?? input.jobId,
            txId: note.txId,
            kind: note.kind,
            text: note.text,
            createdAt,
          })),
        )
        .run();
    }
  });
  return buildResponse(build as BuildRow);
}

export async function updateBuild(
  deps: AppDeps,
  runtime: ReleaseRuntime,
  buildId: string,
  status: BuildRow['status'],
): Promise<Build> {
  const existing = deps.db.select().from(schema.builds).where(eq(schema.builds.id, buildId)).get();
  if (!existing) throw new ReleaseError('build_not_found', 404);
  deps.db.update(schema.builds).set({ status }).where(eq(schema.builds.id, buildId)).run();
  if (status === 'tested') {
    deps.sqlite
      .prepare("UPDATE branches SET latest_build_id = ? WHERE id = ? AND name = 'main' AND latest_build_id IS NULL")
      .run(buildId, existing.branchId);
    await runtime.onBuildTested(existing.gameId, existing.branchId, buildId);
  }
  return buildResponse({ ...existing, status });
}

async function prepareSnapshot(deps: AppDeps, runtime: ReleaseRuntime, build: BuildRow): Promise<SnapshotRow> {
  const baseDoc = await runtime.source.load(build.gameId, build.id);
  const chain = readChain(deps.sqlite, build.branchId);
  const transactions = chain.flatMap(({ txs }) => txs).filter((tx) => tx.branchId === build.branchId);
  const workingSet = reduce({
    gameId: build.gameId,
    branchId: build.branchId,
    buildId: build.id,
    baseDoc,
    txs: transactions,
  });
  const folded = fold(baseDoc, workingSet);
  let snapshot = deps.db
    .select()
    .from(schema.overrideSnapshots)
    .where(
      and(
        eq(schema.overrideSnapshots.gameId, build.gameId),
        eq(schema.overrideSnapshots.buildId, build.id),
        eq(schema.overrideSnapshots.sha256, folded.sha256),
      ),
    )
    .get();
  if (!snapshot) {
    snapshot = {
      id: stableId('snap', runtime.now()),
      gameId: build.gameId,
      branchId: build.branchId,
      buildId: build.id,
      headRev: workingSet.headRev,
      sha256: folded.sha256,
      entriesJson: JSON.stringify(workingSet.entries),
      entityOpsJson: JSON.stringify(workingSet.entityOps),
      foldSha: null,
      createdAt: runtime.now().toISOString(),
    };
    deps.db.insert(schema.overrideSnapshots).values(snapshot).run();
  }
  if (snapshot.foldSha) return snapshot;
  const result = await runtime.commit.execute({
    kind: 'fold_design',
    gameId: build.gameId,
    base: build.gitSha,
    files: folded.files,
  });
  if (!result.ok) throw new ReleaseError('gate_refused', 403, { verdict: result.verdict });
  deps.db
    .update(schema.overrideSnapshots)
    .set({ foldSha: result.sha })
    .where(eq(schema.overrideSnapshots.id, snapshot.id))
    .run();
  return { ...snapshot, foldSha: result.sha };
}

function appendRelease(
  deps: AppDeps,
  runtime: ReleaseRuntime,
  input: {
    gameId: string;
    expected: string | null;
    version: string;
    buildId: string;
    snapshotId: string;
    kind: 'publish' | 'rollback';
    restoresReleaseId?: string;
    changelog: Changelog;
    actor: string;
  },
): ReleaseRow {
  return deps.sqlite
    .transaction(() => {
      const current = deps.sqlite
        .prepare<[string], { published_release_id: string | null }>(
          'SELECT published_release_id FROM games WHERE id = ?',
        )
        .get(input.gameId);
      if (!current || current.published_release_id !== input.expected) throw new ReleaseError('pointer_moved', 409);
      const seq =
        (deps.sqlite
          .prepare<[string], { seq: number | null }>('SELECT MAX(seq) AS seq FROM releases WHERE game_id = ?')
          .get(input.gameId)?.seq ?? 0) + 1;
      const row: ReleaseRow = {
        id: stableId('rel', runtime.now()),
        gameId: input.gameId,
        seq,
        version: input.version,
        buildId: input.buildId,
        snapshotId: input.snapshotId,
        gitTag: `gm/${input.gameId}/v${input.version}`,
        kind: input.kind,
        restoresReleaseId: input.restoresReleaseId ?? null,
        predecessorReleaseId: input.expected,
        changelogJson: JSON.stringify(input.changelog),
        publishedBy: input.actor,
        publishedAt: runtime.now().toISOString(),
      };
      deps.db.insert(schema.releases).values(row).run();
      const moved = deps.sqlite
        .prepare('UPDATE games SET published_release_id = ? WHERE id = ? AND published_release_id IS ?')
        .run(row.id, input.gameId, input.expected);
      if (moved.changes === 0) throw new ReleaseError('pointer_moved', 409);
      if (input.kind === 'publish') {
        deps.db
          .update(schema.changeNotes)
          .set({ releaseId: row.id })
          .where(and(eq(schema.changeNotes.gameId, input.gameId), isNull(schema.changeNotes.releaseId)))
          .run();
      }
      return row;
    })
    .immediate();
}

export async function publish(
  deps: AppDeps,
  runtime: ReleaseRuntime,
  input: { gameId: string; buildId: string; actor: string; changelog?: Changelog },
): Promise<Release> {
  const { build, game } = requireMainBuild(deps, input.gameId, input.buildId);
  const expected = game.publishedReleaseId;
  const rights = await runtime.checkRights(build.artifactPath, game.repoVisibility);
  if (rights.length) throw new ReleaseError('rights', 422, { rights });
  const predecessor = expected
    ? deps.db.select().from(schema.releases).where(eq(schema.releases.id, expected)).get()
    : undefined;
  const snapshot = await prepareSnapshot(deps, runtime, build);
  const version = runtime.deriveVersion(counts(deps, input.gameId));
  const changelog = sanitizeChangelog(input.changelog ?? assembleChangelog(deps, input.gameId, predecessor));
  const result = await runtime.commit.execute({
    kind: 'release',
    gameId: input.gameId,
    sha: snapshot.foldSha!,
    semver: version,
    changelog: renderChangelog(changelog),
  });
  if (!result.ok) throw new ReleaseError('gate_refused', 403, { verdict: result.verdict });
  return releaseResponse(
    appendRelease(deps, runtime, {
      gameId: input.gameId,
      expected,
      version,
      buildId: build.id,
      snapshotId: snapshot.id,
      kind: 'publish',
      changelog,
      actor: input.actor,
    }),
  );
}

export async function rollback(
  deps: AppDeps,
  runtime: ReleaseRuntime,
  input: { gameId: string; releaseId: string; actor: string },
): Promise<Release & { affectedSaves: number | null }> {
  const game = deps.db.select().from(schema.games).where(eq(schema.games.id, input.gameId)).get();
  if (!game) throw new ReleaseError('game_not_found', 404);
  const target = deps.db
    .select()
    .from(schema.releases)
    .where(and(eq(schema.releases.id, input.releaseId), eq(schema.releases.gameId, input.gameId)))
    .get();
  if (!target) throw new ReleaseError('release_not_found', 404);
  const snapshot = deps.db
    .select()
    .from(schema.overrideSnapshots)
    .where(eq(schema.overrideSnapshots.id, target.snapshotId))
    .get();
  const build = deps.db.select().from(schema.builds).where(eq(schema.builds.id, target.buildId)).get();
  if (!snapshot?.foldSha || !build) throw new ReleaseError('release_incomplete', 409);
  const version = runtime.deriveVersion(counts(deps, input.gameId));
  const changelog = { summary: `Restores ${target.version}`, items: [] };
  const result = await runtime.commit.execute({
    kind: 'release',
    gameId: input.gameId,
    sha: snapshot.foldSha,
    semver: version,
    changelog: changelog.summary,
  });
  if (!result.ok) throw new ReleaseError('gate_refused', 403, { verdict: result.verdict });
  const row = appendRelease(deps, runtime, {
    gameId: input.gameId,
    expected: game.publishedReleaseId,
    version,
    buildId: target.buildId,
    snapshotId: target.snapshotId,
    kind: 'rollback',
    restoresReleaseId: target.id,
    changelog,
    actor: input.actor,
  });
  return {
    ...releaseResponse(row),
    affectedSaves: await runtime.countSavesAboveSchema(input.gameId, build.saveSchemaVersion),
  };
}

export function listReleases(deps: AppDeps, gameId: string): Release[] {
  return deps.db
    .select()
    .from(schema.releases)
    .where(eq(schema.releases.gameId, gameId))
    .orderBy(schema.releases.seq)
    .all()
    .map(releaseResponse);
}

export function published(deps: AppDeps, gameId: string) {
  const game = deps.db.select().from(schema.games).where(eq(schema.games.id, gameId)).get();
  if (!game?.publishedReleaseId) throw new ReleaseError('not_published', 404);
  const release = deps.db.select().from(schema.releases).where(eq(schema.releases.id, game.publishedReleaseId)).get();
  if (!release) throw new ReleaseError('not_published', 404);
  return releaseResponse(release);
}

export function addChangeNote(
  deps: AppDeps,
  runtime: ReleaseRuntime,
  input: { gameId: string; jobId: string; kind: ChangeNote['kind']; text: string },
): ChangeNote {
  const note = { id: stableId('note', runtime.now()), ...input, createdAt: runtime.now().toISOString() };
  deps.db.insert(schema.changeNotes).values(note).run();
  return { jobId: input.jobId, kind: input.kind, text: input.text };
}

export function listBuilds(deps: AppDeps, gameId: string): Build[] {
  return deps.db.select().from(schema.builds).where(eq(schema.builds.gameId, gameId)).all().map(buildResponse);
}
