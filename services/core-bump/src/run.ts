import { bumpInstance, type RunCommand } from './bump.js';
import type { CommitIdentity, InstanceGitHub, PullRequestRef } from './github.js';
import { branchFor, isCurrent, readCorePin, shortSha } from './pin.js';

const PIN_PATH = 'vendor/core.json';
const BRANCH_PREFIX = 'core-bump/';

export type Outcome =
  | { readonly repo: string; readonly action: 'current'; readonly pin: string }
  | { readonly repo: string; readonly action: 'pull-open'; readonly url: string }
  | { readonly repo: string; readonly action: 'no-pin'; readonly detail: string }
  | { readonly repo: string; readonly action: 'no-script' }
  | { readonly repo: string; readonly action: 'no-change'; readonly pin: string }
  | {
      readonly repo: string;
      readonly action: 'opened';
      readonly pin: string;
      readonly branch: string;
      readonly url: string;
    }
  | { readonly repo: string; readonly action: 'error'; readonly message: string };

export type PassInput = {
  readonly repos: readonly string[];
  readonly coreRepo: string;
  readonly coreBranch: string;
  readonly targetSha: string;
  readonly workRoot: string;
  readonly github: InstanceGitHub;
  readonly run: RunCommand;
};

function pullTitle(targetSha: string): string {
  return `Bump Game Maker core to ${shortSha(targetSha)}`;
}

export function pullBody(input: {
  repo: string;
  coreRepo: string;
  coreBranch: string;
  targetSha: string;
  pinned: string;
}): string {
  return [
    `Core \`${input.coreRepo}\` \`${input.coreBranch}\` is at ${input.targetSha}.`,
    '',
    `This branch is \`scripts/bump-core.sh\` from ${input.repo} run at that commit: it moves the vendored core pin in`,
    `\`${PIN_PATH}\` from ${shortSha(input.pinned)} to ${shortSha(input.targetSha)}.`,
    '',
    'The checks on this pull request gate the merge. The host job opens it and never merges it.',
  ].join('\n');
}

async function bumpOne(input: PassInput, repo: string, identity: CommitIdentity): Promise<Outcome> {
  const base = await input.github.defaultBranch(repo);
  const text = await input.github.readFile(repo, PIN_PATH, base);
  if (text === null) return { repo, action: 'no-pin', detail: `${PIN_PATH} is not in ${repo} yet` };

  const read = readCorePin(text);
  if (!read.ok) return { repo, action: 'no-pin', detail: read.reason };
  if (isCurrent(read.pin, input.targetSha)) return { repo, action: 'current', pin: read.pin.sha };

  const open: PullRequestRef | null = await input.github.openPullWithPrefix(repo, BRANCH_PREFIX);
  if (open !== null) return { repo, action: 'pull-open', url: open.url };

  const bumped = await bumpInstance({
    repo,
    base,
    targetSha: input.targetSha,
    workRoot: input.workRoot,
    token: await input.github.installationToken(),
    identity,
    run: input.run,
  });

  if (bumped.status === 'no-script') return { repo, action: 'no-script' };
  if (bumped.status === 'no-change') return { repo, action: 'no-change', pin: bumped.pin };

  const pull = await input.github.createPull({
    repo,
    head: bumped.branch,
    base,
    title: pullTitle(input.targetSha),
    body: pullBody({
      repo,
      coreRepo: input.coreRepo,
      coreBranch: input.coreBranch,
      targetSha: input.targetSha,
      pinned: read.pin.sha,
    }),
  });

  return { repo, action: 'opened', pin: bumped.pin, branch: bumped.branch, url: pull.url };
}

/**
 * One pass over the instance repositories. Every repository is checked even when one of them fails, so a
 * broken instance does not hold the others back.
 */
export async function runPass(input: PassInput): Promise<Outcome[]> {
  const identity = await input.github.botIdentity();
  const outcomes: Outcome[] = [];
  for (const repo of input.repos) {
    try {
      outcomes.push(await bumpOne(input, repo, identity));
    } catch (error) {
      outcomes.push({ repo, action: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }
  return outcomes;
}

export function failed(outcomes: readonly Outcome[]): boolean {
  return outcomes.some((outcome) => outcome.action === 'error');
}

export function branchName(targetSha: string): string {
  return branchFor(targetSha);
}
