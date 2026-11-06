import { access, mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import type { CommitIdentity } from './github.js';
import { branchFor, readCorePin, shortSha } from './pin.js';

export type CommandResult = { readonly code: number; readonly stdout: string; readonly stderr: string };

export type CommandOptions = { readonly cwd: string; readonly env: Record<string, string> };

export type RunCommand = (file: string, args: readonly string[], options: CommandOptions) => Promise<CommandResult>;

export type BumpOutcome =
  | { readonly status: 'no-script' }
  | { readonly status: 'no-change'; readonly pin: string }
  | { readonly status: 'pushed'; readonly pin: string; readonly branch: string; readonly reused: boolean };

export type BumpInput = {
  readonly repo: string;
  readonly base: string;
  readonly targetSha: string;
  readonly workRoot: string;
  readonly token: string;
  readonly identity: CommitIdentity;
  readonly run: RunCommand;
};

/**
 * The clone-and-push environment. The token reaches git through the helper's environment, never through
 * argv, so it stays out of `ps` output and the journal.
 */
export function gitAuthEnv(token: string, base?: NodeJS.ProcessEnv): Record<string, string> {
  // The inherited environment goes to the child untouched (git needs PATH and the unit's own variables);
  // no value is read here.
  // eslint-disable-next-line no-restricted-properties
  const source: NodeJS.ProcessEnv = base ?? process.env;
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(source)) if (value !== undefined) env[name] = value;
  env.GIT_TERMINAL_PROMPT = '0';
  env.OGM_CORE_BUMP_GIT_TOKEN = token;
  env.GIT_CONFIG_COUNT = '1';
  env.GIT_CONFIG_KEY_0 = 'credential.helper';
  env.GIT_CONFIG_VALUE_0 =
    '!f() { test "$1" = get || return 0; echo username=x-access-token; echo "password=$OGM_CORE_BUMP_GIT_TOKEN"; }; f';
  return env;
}

function checkoutDir(workRoot: string, repo: string): string {
  return join(workRoot, repo.replace(/[^a-z0-9]+/gi, '-').toLowerCase());
}

async function must(run: RunCommand, file: string, args: readonly string[], options: CommandOptions, what: string) {
  const result = await run(file, args, options);
  if (result.code !== 0) {
    const detail = `${result.stderr}${result.stdout}`.trim().split(/\r?\n/).slice(-3).join(' ').slice(0, 400);
    throw new Error(`${what} failed (exit ${result.code})${detail === '' ? '' : `: ${detail}`}`);
  }
  return result;
}

/**
 * Checks the instance repository out at its base branch, runs the repository's own
 * `scripts/bump-core.sh` at the target commit, and pushes the result to a `core-bump/<sha>` branch.
 * Nothing is pushed unless the pin in `vendor/core.json` ends up on the target commit.
 */
export async function bumpInstance(input: BumpInput): Promise<BumpOutcome> {
  const dir = checkoutDir(input.workRoot, input.repo);
  const env = gitAuthEnv(input.token);
  const cwd = { cwd: input.workRoot, env };

  await rm(dir, { recursive: true, force: true });
  await mkdir(input.workRoot, { recursive: true });
  await must(
    input.run,
    'git',
    ['clone', '--depth', '1', '--branch', input.base, `https://github.com/${input.repo}.git`, dir],
    cwd,
    `clone ${input.repo}`,
  );

  const script = join(dir, 'scripts', 'bump-core.sh');
  const present = await access(script).then(
    () => true,
    () => false,
  );
  if (!present) return { status: 'no-script' };

  const inClone = { cwd: dir, env };
  await must(input.run, 'bash', ['scripts/bump-core.sh', input.targetSha], inClone, 'scripts/bump-core.sh');

  const text = await readFile(join(dir, 'vendor', 'core.json'), 'utf8').catch(() => null);
  if (text === null) throw new Error('scripts/bump-core.sh left no vendor/core.json');
  const read = readCorePin(text);
  if (!read.ok) throw new Error(`scripts/bump-core.sh wrote an unreadable vendor/core.json: ${read.reason}`);
  if (read.pin.sha !== input.targetSha.toLowerCase()) {
    throw new Error(`scripts/bump-core.sh pinned ${shortSha(read.pin.sha)}, not ${shortSha(input.targetSha)}`);
  }

  const branch = branchFor(input.targetSha);
  const remote = await must(input.run, 'git', ['ls-remote', '--heads', 'origin', branch], inClone, 'git ls-remote');
  // An earlier tick that pushed and then failed to open the pull request leaves the branch in place. Reuse it
  // rather than pushing the same commit again, which git would refuse.
  if (remote.stdout.trim() !== '') return { status: 'pushed', pin: read.pin.sha, branch, reused: true };

  const status = await must(input.run, 'git', ['status', '--porcelain'], inClone, 'git status');
  if (status.stdout.trim() === '') return { status: 'no-change', pin: read.pin.sha };

  await must(input.run, 'git', ['add', '--all'], inClone, 'git add');
  await must(
    input.run,
    'git',
    [
      '-c',
      `user.name=${input.identity.name}`,
      '-c',
      `user.email=${input.identity.email}`,
      'commit',
      '--message',
      `Bump Game Maker core to ${shortSha(input.targetSha)}`,
    ],
    inClone,
    'git commit',
  );

  await must(input.run, 'git', ['push', 'origin', `HEAD:refs/heads/${branch}`], inClone, 'git push');
  return { status: 'pushed', pin: read.pin.sha, branch, reused: false };
}
