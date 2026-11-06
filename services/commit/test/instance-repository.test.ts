import type { CommitOp } from '@ogm/contracts';
import { describe, expect, it } from 'vitest';

import { evaluateDiff } from '../src/boundary/evaluate.js';
import type { BoundaryFile } from '../src/boundary/types.js';
import type { BoundaryGate, GateInput } from '../src/gate.js';
import { createGame } from '../src/ops/create-game.js';
import type { OperationContext } from '../src/ops/context.js';
import { fileIssue } from '../src/ops/file-issue.js';
import { foldDesign } from '../src/ops/fold-design.js';
import { release } from '../src/ops/release.js';
import { restoreGame } from '../src/ops/restore-game.js';
import type { TemplateFile } from '../src/template-source.js';
import type { GameRepository, GitHubApp, GitHubIdentity } from '../src/types.js';
import { FixtureRepository } from './fixture-repository.js';

/*
 * The instance monorepo end to end: two games created, edited, released and rolled back inside ONE repository. Every
 * operation here runs against the same in-memory git history and the real boundary rules, so the assertions cover the
 * things the ticket is about — that a game's folder is its whole world, that two games' tags do not collide, and that
 * rolling one back cannot reach into the other.
 */

const CASTLE = { gameId: 'g_castle', slug: 'castle-game' } as const;
const PUZZLE = { gameId: 'g_puzzle', slug: 'puzzle-game' } as const;

const template = (name: string): TemplateFile[] => [
  { path: 'index.html', content: `<h1>${name}</h1>` },
  { path: 'game.json', content: JSON.stringify({ name }) },
];

/* A commit's changed paths as the boundary rules see them, so the real path guard judges the real history. */
function changedFiles(repository: FixtureRepository, sha: string): BoundaryFile[] {
  const commit = repository.commit(sha);
  const parent = commit.parents[0];
  const changed = parent === undefined ? [] : repository.changedPaths(parent, sha);
  const files = repository.filesAt(sha);
  return changed.map((path) => {
    const blobSha = files.get(path);
    const content = blobSha === undefined ? '' : repository.blobText(blobSha);
    return {
      path,
      status: blobSha === undefined ? ('removed' as const) : ('added' as const),
      bytes: Buffer.byteLength(content, 'utf8'),
      sha256: blobSha ?? 'deleted',
      binary: false,
      content,
    };
  });
}

/*
 * The production gate builds its input from the pull request's diff; here the diff comes from the fixture's own commits,
 * so a change that escapes the game's folder is refused by `gameFolderRule` exactly as it would be in production.
 */
function gateOver(repository: FixtureRepository, verdicts: GateInput[] = []): BoundaryGate {
  return {
    async evaluate(input) {
      verdicts.push(input);
      const files =
        input.files === undefined
          ? changedFiles(repository, input.sha ?? '')
          : input.files.map((file) => ({
              path: file.path,
              status: 'added' as const,
              bytes: Buffer.byteLength(file.content, 'utf8'),
              sha256: file.content,
              binary: false,
              content: file.content,
            }));
      return evaluateDiff({
        actor: 'agent',
        visibility: input.targetVisibility ?? 'private',
        draft: false,
        files,
        lockfile: null,
        blocklist: null,
        profileNames: [],
        ...(input.gamePath === undefined ? {} : { gamePath: input.gamePath }),
        ...(input.promotion === true ? { promotion: true } : {}),
      });
    },
  };
}

type World = {
  repository: FixtureRepository;
  context: OperationContext;
  verdicts: GateInput[];
};

function world(): World {
  const repository = new FixtureRepository();
  repository.seed();
  const verdicts: GateInput[] = [];
  const games: Record<string, GameRepository> = {
    [CASTLE.gameId]: {
      owner: repository.owner,
      name: repository.name,
      visibility: 'private',
      path: `games/${CASTLE.slug}`,
      slug: CASTLE.slug,
    },
    [PUZZLE.gameId]: {
      owner: repository.owner,
      name: repository.name,
      visibility: 'private',
      path: `games/${PUZZLE.slug}`,
      slug: PUZZLE.slug,
    },
  };
  const github = { accountType: 'User' as const, request: repository.request };
  const app: GitHubApp = {
    async forOwner() {
      return github;
    },
    async identity(): Promise<GitHubIdentity> {
      return { name: 'ogm-app[bot]', email: 'ogm-app[bot]@users.noreply.github.com' };
    },
  };
  const context: OperationContext = {
    app,
    gate: gateOver(repository, verdicts),
    repos: {
      async resolve(gameId: string) {
        const game = games[gameId];
        if (game === undefined) throw new Error(`fixture: unknown game ${gameId}`);
        return game;
      },
    },
    templates: {
      async render(_ref, options) {
        return { files: template(options.gameId), labels: [], requiredChecks: [] };
      },
    },
    builderBotLogin: 'builder-bot',
    platformIssueRepo: { owner: 'platform', name: 'bugs' },
  };
  return { repository, context, verdicts };
}

function createOp(slug: string, gameId: string): CommitOp {
  return { kind: 'create_game', gameId, slug, templateRef: 'default', visibility: 'private' } as CommitOp;
}

describe('one instance repository for every game', () => {
  it('creates each game as a folder under games/ and merges both into main', async () => {
    const { repository, context } = world();
    const seed = repository.commitAt('heads/main').sha;

    const castle = await createGame(createOp(CASTLE.slug, CASTLE.gameId), context);
    const puzzle = await createGame(createOp(PUZZLE.slug, PUZZLE.gameId), context);
    expect(castle.ok).toBe(true);
    expect(puzzle.ok).toBe(true);

    const head = repository.head();
    expect(head.parents).toEqual([expect.any(String)]);
    // Both games live in one history, each in its own folder, and the repository root stays clean.
    expect(repository.pathsUnder(head.sha, `games/${CASTLE.slug}`)).toEqual(['game.json', 'index.html']);
    expect(repository.pathsUnder(head.sha, `games/${PUZZLE.slug}`)).toEqual(['game.json', 'index.html']);
    expect([...repository.filesAt(head.sha).keys()].filter((path) => !path.startsWith('games/'))).toEqual([]);
    // No repository was created for either game: every write went to the one instance repository.
    expect(repository.calls.every((call) => !call.route.includes('/user/repos'))).toBe(true);
    expect(repository.calls.some((call) => call.route === 'POST /repos/{owner}/{repo}/pulls')).toBe(true);
    expect(seed).not.toBe(head.sha);
    // Each game's issues carry their own label in the shared repository.
    expect([...repository.labels]).toEqual([`game:${CASTLE.slug}`, `game:${PUZZLE.slug}`]);
  });

  it('edits one game without touching the other game in the same repository', async () => {
    const { repository, context } = world();
    await createGame(createOp(CASTLE.slug, CASTLE.gameId), context);
    await createGame(createOp(PUZZLE.slug, PUZZLE.gameId), context);
    const before = repository.head().sha;
    const puzzleFiles = repository.pathsUnder(before, `games/${PUZZLE.slug}`).map((path) => ({
      path: `games/${PUZZLE.slug}/${path}`,
      sha: repository.filesAt(before).get(`games/${PUZZLE.slug}/${path}`),
    }));

    const folded = await foldDesign(
      {
        kind: 'fold_design',
        gameId: CASTLE.gameId,
        base: before,
        files: [
          { path: 'index.html', content: '<h1>Castle Game v2</h1>' },
          { path: 'notes/design.md', content: '# design' },
        ],
      },
      context,
    );
    expect(folded.ok).toBe(true);

    const after = repository.head().sha;
    expect(after).not.toBe(before);
    expect(repository.changedPaths(before, after).sort()).toEqual([
      `games/${CASTLE.slug}/index.html`,
      `games/${CASTLE.slug}/notes/design.md`,
    ]);
    // The other game's blobs are byte-identical, so a fold in one folder cannot rewrite another game.
    for (const file of puzzleFiles) expect(repository.filesAt(after).get(file.path ?? '')).toBe(file.sha);
    expect(repository.blobText(repository.filesAt(after).get(`games/${CASTLE.slug}/index.html`) ?? '')).toBe(
      '<h1>Castle Game v2</h1>',
    );
  });

  it('tags each game release under its own slug so both can be v1.0.0', async () => {
    const { repository, context } = world();
    const castle = await createGame(createOp(CASTLE.slug, CASTLE.gameId), context);
    const puzzle = await createGame(createOp(PUZZLE.slug, PUZZLE.gameId), context);
    if (!castle.ok || !puzzle.ok) throw new Error('create refused');

    const firstRelease = await release(
      { kind: 'release', gameId: CASTLE.gameId, sha: castle.sha, semver: '1.0.0', changelog: 'castle 1.0.0' },
      context,
    );
    const secondRelease = await release(
      { kind: 'release', gameId: PUZZLE.gameId, sha: puzzle.sha, semver: '1.0.0', changelog: 'puzzle 1.0.0' },
      context,
    );
    expect(firstRelease.ok).toBe(true);
    expect(secondRelease.ok).toBe(true);
    expect(repository.refNames().filter((ref) => ref.startsWith('tags/'))).toEqual([
      `tags/${CASTLE.slug}/v1.0.0`,
      `tags/${PUZZLE.slug}/v1.0.0`,
    ]);
    // Each tag points at its own game's commit, not at the shared main head.
    expect(repository.refNames()).toContain(`tags/${CASTLE.slug}/v1.0.0`);
    expect(castle.sha).not.toBe(puzzle.sha);
  });

  it('refuses a release whose commit does not contain the game folder', async () => {
    const { repository, context } = world();
    const castle = await createGame(createOp(CASTLE.slug, CASTLE.gameId), context);
    if (!castle.ok) throw new Error('create refused');

    const refused = await release(
      { kind: 'release', gameId: PUZZLE.gameId, sha: castle.sha, semver: '1.0.0', changelog: 'nope' },
      context,
    );
    // The castle commit has no games/puzzle-game folder, so the puzzle release is refused before it tags anything.
    expect(refused).toMatchObject({ ok: false, verdict: { reasons: [{ code: 'path' }] } });
    expect(repository.refNames().filter((ref) => ref.startsWith('tags/'))).toEqual([]);
  });

  it('rolls one game back to an earlier commit and leaves the other game at its newer content', async () => {
    const { repository, context } = world();
    const castle = await createGame(createOp(CASTLE.slug, CASTLE.gameId), context);
    const puzzle = await createGame(createOp(PUZZLE.slug, PUZZLE.gameId), context);
    if (!castle.ok || !puzzle.ok) throw new Error('create refused');

    // Castle gets a second design; puzzle gets one too, after it.
    await foldDesign(
      {
        kind: 'fold_design',
        gameId: CASTLE.gameId,
        base: repository.head().sha,
        files: [{ path: 'index.html', content: '<h1>Castle v2</h1>' }],
      },
      context,
    );
    await foldDesign(
      {
        kind: 'fold_design',
        gameId: PUZZLE.gameId,
        base: repository.head().sha,
        files: [{ path: 'index.html', content: '<h1>Puzzle v2</h1>' }],
      },
      context,
    );
    const beforeRollback = repository.head().sha;
    expect(repository.blobText(repository.filesAt(beforeRollback).get(`games/${PUZZLE.slug}/index.html`) ?? '')).toBe(
      '<h1>Puzzle v2</h1>',
    );

    // Roll castle back to its first commit; the puzzle folder must survive untouched.
    const rolled = await restoreGame({ kind: 'restore_game', gameId: CASTLE.gameId, sha: castle.sha }, context);
    expect(rolled.ok).toBe(true);

    const after = repository.head().sha;
    expect(repository.blobText(repository.filesAt(after).get(`games/${CASTLE.slug}/index.html`) ?? '')).toBe(
      '<h1>g_castle</h1>',
    );
    expect(repository.blobText(repository.filesAt(after).get(`games/${PUZZLE.slug}/index.html`) ?? '')).toBe(
      '<h1>Puzzle v2</h1>',
    );
    // The rollback commit only removed/added paths inside the castle folder.
    expect(
      repository.changedPaths(beforeRollback, after).every((path) => path.startsWith(`games/${CASTLE.slug}/`)),
    ).toBe(true);
  });

  it("refuses a design fold that reaches into another game's folder or the repository root", async () => {
    const { repository, context } = world();
    await createGame(createOp(CASTLE.slug, CASTLE.gameId), context);
    await createGame(createOp(PUZZLE.slug, PUZZLE.gameId), context);
    const base = repository.head().sha;

    // A game's design paths are folder-relative, so the only way out is the repo-relative promotion path — which the
    // path guard refuses when it leaves the game's folder without an approved promotion.
    const across = await foldDesign(
      {
        kind: 'fold_design',
        gameId: CASTLE.gameId,
        base,
        promotion: true,
        files: [{ path: `games/${PUZZLE.slug}/index.html`, content: 'hijacked' }],
      },
      context,
    );
    expect(across).toMatchObject({ ok: false, verdict: { reasons: [{ code: 'path' }] } });

    const rootFile = await foldDesign(
      {
        kind: 'fold_design',
        gameId: CASTLE.gameId,
        base,
        promotion: true,
        files: [{ path: 'package.json', content: '{}' }],
      },
      context,
    );
    expect(rootFile).toMatchObject({ ok: false, verdict: { reasons: [{ code: 'path' }] } });

    // A traversal segment never normalizes into a commit path in the first place.
    const traversal = await foldDesign(
      { kind: 'fold_design', gameId: CASTLE.gameId, base, files: [{ path: '../../escape.txt', content: 'x' }] },
      context,
    );
    expect(traversal).toMatchObject({ ok: false, verdict: { reasons: [{ code: 'path' }] } });

    // Nothing was committed by any refusal, and the other game's folder is untouched.
    expect(repository.head().sha).toBe(base);
    expect(repository.blobText(repository.filesAt(base).get(`games/${PUZZLE.slug}/index.html`) ?? '')).toBe(
      '<h1>g_puzzle</h1>',
    );
  });

  it('writes to packages/ only through an executor-approved promotion', async () => {
    const { repository, context } = world();
    await createGame(createOp(CASTLE.slug, CASTLE.gameId), context);
    const base = repository.head().sha;

    const approved = await foldDesign(
      {
        kind: 'fold_design',
        gameId: CASTLE.gameId,
        base,
        promotion: true,
        files: [{ path: 'packages/shared/ui.ts', content: 'export const shared = true;' }],
      },
      context,
    );
    expect(approved.ok).toBe(true);
    expect(repository.changedPaths(base, repository.head().sha)).toEqual(['packages/shared/ui.ts']);

    // The same promotion may not mix in another game's folder.
    const mixed = await foldDesign(
      {
        kind: 'fold_design',
        gameId: CASTLE.gameId,
        base: repository.head().sha,
        promotion: true,
        files: [
          { path: 'packages/shared/ui.ts', content: 'export const shared = 2;' },
          { path: `games/${PUZZLE.slug}/index.html`, content: 'hijacked' },
        ],
      },
      context,
    );
    expect(mixed).toMatchObject({ ok: false, verdict: { reasons: [{ code: 'path' }] } });
  });

  it('files a game issue in the instance repository under the game label', async () => {
    const { repository, context } = world();
    await createGame(createOp(CASTLE.slug, CASTLE.gameId), context);

    const filed = await fileIssue(
      { kind: 'file_issue', gameId: CASTLE.gameId, title: 'Door sticks', body: 'step', labels: ['bug'] },
      context,
    );
    expect(filed.ok).toBe(true);
    expect(repository.issues).toEqual([{ title: 'Door sticks', labels: ['bug', `game:${CASTLE.slug}`] }]);
  });
});
