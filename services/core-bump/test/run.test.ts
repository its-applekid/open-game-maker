import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { InstanceGitHub, PullRequestRef } from '../src/github.js';
import { pullBody, runPass, type PassInput } from '../src/run.js';
import { harness, NEW, OLD, TOKEN, workRoot } from './harness.js';

const CORE = 'its-everdred/open-game-maker';
const REPO = 'its-everdred/open-games';

type Created = { repo: string; head: string; base: string; title: string; body: string };

function fakeGitHub(
  init: {
    base?: string;
    pin?: string | null;
    openPull?: PullRequestRef | null;
    failOn?: string;
  } = {},
) {
  const created: Created[] = [];
  const github: InstanceGitHub = {
    async defaultBranch(repo) {
      if (init.failOn === repo) throw new Error(`cannot read ${repo}`);
      return init.base ?? 'main';
    },
    async readFile() {
      return init.pin === undefined ? JSON.stringify({ core: { sha: OLD } }) : init.pin;
    },
    async openPullWithPrefix() {
      return init.openPull ?? null;
    },
    async createPull(input) {
      created.push(input);
      return { number: 7, url: 'https://github.com/its-everdred/open-games/pull/7' };
    },
    async botIdentity() {
      return { name: 'ogm-bot[bot]', email: 'ogm-bot[bot]@users.noreply.github.com' };
    },
    async installationToken() {
      return TOKEN;
    },
  };
  return { created, github };
}

async function pass(github: InstanceGitHub, run: PassInput['run'], repos: readonly string[] = [REPO]) {
  return runPass({
    repos,
    coreRepo: CORE,
    coreBranch: 'main',
    targetSha: NEW,
    workRoot: await workRoot(),
    github,
    run,
  });
}

describe('runPass', () => {
  it('leaves a repository that already pins the core head alone', async () => {
    const { calls, run } = harness();
    const { created, github } = fakeGitHub({ pin: JSON.stringify({ core: { sha: NEW } }) });

    expect(await pass(github, run)).toEqual([{ repo: REPO, action: 'current', pin: NEW }]);
    expect(calls).toEqual([]);
    expect(created).toEqual([]);
  });

  it('bumps a repository whose pin is behind the core head and opens a pull request', async () => {
    const { run } = harness();
    const { created, github } = fakeGitHub();

    const outcomes = await pass(github, run);

    expect(outcomes).toEqual([
      {
        repo: REPO,
        action: 'opened',
        pin: NEW,
        branch: `core-bump/${NEW.slice(0, 12)}`,
        url: 'https://github.com/its-everdred/open-games/pull/7',
      },
    ]);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ repo: REPO, base: 'main', head: `core-bump/${NEW.slice(0, 12)}` });
    expect(created[0]?.title).toBe(`Bump Game Maker core to ${NEW.slice(0, 12)}`);
    expect(created[0]?.body).toContain('vendor/core.json');
    expect(created[0]?.body).toContain(CORE);
  });

  it('does not stack a second pull request on an open core bump', async () => {
    const { calls, run } = harness();
    const { created, github } = fakeGitHub({
      openPull: { number: 4, url: 'https://github.com/its-everdred/open-games/pull/4' },
    });

    expect(await pass(github, run)).toEqual([
      { repo: REPO, action: 'pull-open', url: 'https://github.com/its-everdred/open-games/pull/4' },
    ]);
    expect(calls).toEqual([]);
    expect(created).toEqual([]);
  });

  it('skips a repository that has not adopted vendoring', async () => {
    const { github } = fakeGitHub({ pin: null });

    expect(await pass(github, harness().run)).toEqual([
      { repo: REPO, action: 'no-pin', detail: 'vendor/core.json is not in its-everdred/open-games yet' },
    ]);
  });

  it('reports an unreadable pin instead of bumping', async () => {
    const { calls, run } = harness();
    const { github } = fakeGitHub({ pin: '{ "core": {} }' });

    expect(await pass(github, run)).toEqual([
      { repo: REPO, action: 'no-pin', detail: 'core.sha is not a 40-character commit id' },
    ]);
    expect(calls).toEqual([]);
  });

  it('reports a repository with no bump script', async () => {
    const { run } = harness({ script: false });

    expect(await pass(fakeGitHub({}).github, run)).toEqual([{ repo: REPO, action: 'no-script' }]);
  });

  it('reports a failed repository and still checks the next one', async () => {
    const { github } = fakeGitHub({ failOn: 'broken/instance' });

    const outcomes = await pass(github, harness().run, ['broken/instance', REPO]);

    expect(outcomes[0]).toEqual({ repo: 'broken/instance', action: 'error', message: 'cannot read broken/instance' });
    expect(outcomes[1]?.action).toBe('opened');
  });
});

describe('pullBody', () => {
  it('names both commits and says the pull request is never merged by the job', () => {
    const body = pullBody({ repo: REPO, coreRepo: CORE, coreBranch: 'main', targetSha: NEW, pinned: OLD });

    expect(body).toContain(`${OLD.slice(0, 12)} to ${NEW.slice(0, 12)}`);
    expect(body).toContain('never merges');
  });
});

it('keeps the cloned checkout inside the configured work directory', async () => {
  const root = await workRoot();
  const { calls, run } = harness();
  const { github } = fakeGitHub();

  await runPass({
    repos: [REPO],
    coreRepo: CORE,
    coreBranch: 'main',
    targetSha: NEW,
    workRoot: root,
    github,
    run,
  });

  const clone = calls.find((call) => call.args[0] === 'clone');
  expect(clone?.args.at(-1)).toBe(join(root, 'its-everdred-open-games'));
  await expect(readFile(join(root, 'its-everdred-open-games', 'vendor', 'core.json'), 'utf8')).resolves.toContain(NEW);
});
