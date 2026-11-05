import { describe, expect, it } from 'vitest';

import { bumpInstance, gitAuthEnv, type RunCommand } from '../src/bump.js';
import { harness, NEW, OLD, TOKEN, workRoot } from './harness.js';

function input(root: string, run: RunCommand) {
  return {
    repo: 'its-everdred/open-games',
    base: 'main',
    targetSha: NEW,
    workRoot: root,
    token: TOKEN,
    identity: { name: 'ogm-bot[bot]', email: 'ogm-bot[bot]@users.noreply.github.com' },
    run,
  };
}

describe('bumpInstance', () => {
  it('runs the instance bump script and pushes a branch pinned at the target commit', async () => {
    const { calls, run } = harness();
    const outcome = await bumpInstance(input(await workRoot(), run));

    expect(outcome).toEqual({ status: 'pushed', pin: NEW, branch: `core-bump/${NEW.slice(0, 12)}`, reused: false });

    const clone = calls.find((call) => call.file === 'git' && call.args[0] === 'clone');
    expect(clone?.args).toEqual([
      'clone',
      '--depth',
      '1',
      '--branch',
      'main',
      'https://github.com/its-everdred/open-games.git',
      expect.stringContaining('ogm-core-bump'),
    ]);

    const script = calls.find((call) => call.file === 'bash');
    expect(script?.args).toEqual(['scripts/bump-core.sh', NEW]);

    const push = calls.find((call) => call.file === 'git' && call.args[0] === 'push');
    expect(push?.args).toEqual(['push', 'origin', `HEAD:refs/heads/core-bump/${NEW.slice(0, 12)}`]);
    expect(push?.options.env.GIT_CONFIG_KEY_0).toBe('credential.helper');
    expect(push?.options.env.GIT_CONFIG_VALUE_0).toContain('OGM_CORE_BUMP_GIT_TOKEN');

    const commit = calls.find((call) => call.file === 'git' && call.args.includes('commit'));
    expect(commit?.args).toContain('user.name=ogm-bot[bot]');
    expect(commit?.args).toContain(`Bump Game Maker core to ${NEW.slice(0, 12)}`);
  });

  it('never puts the installation token in a command argument', async () => {
    const { calls, run } = harness();
    await bumpInstance(input(await workRoot(), run));

    for (const call of calls) {
      expect(call.args.join(' ')).not.toContain(TOKEN);
      expect(call.options.env.OGM_CORE_BUMP_GIT_TOKEN).toBe(TOKEN);
    }
  });

  it('reuses a branch an earlier tick already pushed', async () => {
    const { calls, run } = harness({ branchExists: true });

    expect(await bumpInstance(input(await workRoot(), run))).toEqual({
      status: 'pushed',
      pin: NEW,
      branch: `core-bump/${NEW.slice(0, 12)}`,
      reused: true,
    });
    expect(calls.some((call) => call.args.includes('push'))).toBe(false);
  });

  it('reports a failed clone', async () => {
    const { run } = harness({ cloneFails: 'repository not found' });

    await expect(bumpInstance(input(await workRoot(), run))).rejects.toThrow(
      /clone its-everdred\/open-games failed \(exit 128\): repository not found/,
    );
  });

  it('reports a repository with no bump script instead of failing', async () => {
    const { calls, run } = harness({ script: false });
    const outcome = await bumpInstance(input(await workRoot(), run));

    expect(outcome).toEqual({ status: 'no-script' });
    expect(calls.some((call) => call.file === 'bash')).toBe(false);
    expect(calls.some((call) => call.args.includes('push'))).toBe(false);
  });

  it('refuses to push when the script does not pin the target commit', async () => {
    const { calls, run } = harness({ writtenPin: OLD });

    await expect(bumpInstance(input(await workRoot(), run))).rejects.toThrow(/pinned 111111111111, not 222222222222/);
    expect(calls.some((call) => call.args.includes('push'))).toBe(false);
  });

  it('surfaces a failing bump script without pushing', async () => {
    const { calls, run } = harness({ scriptExit: 3 });

    await expect(bumpInstance(input(await workRoot(), run))).rejects.toThrow(
      /scripts\/bump-core\.sh failed \(exit 3\)/,
    );
    expect(calls.some((call) => call.args.includes('push'))).toBe(false);
  });

  it('pushes nothing when the script changed no file', async () => {
    const { calls, run } = harness({ dirty: false });

    expect(await bumpInstance(input(await workRoot(), run))).toEqual({ status: 'no-change', pin: NEW });
    expect(calls.some((call) => call.args.includes('push'))).toBe(false);
  });
});

describe('gitAuthEnv', () => {
  it('carries the token in the environment only', () => {
    const env = gitAuthEnv(TOKEN, { PATH: '/usr/bin' });

    expect(env.PATH).toBe('/usr/bin');
    expect(env.OGM_CORE_BUMP_GIT_TOKEN).toBe(TOKEN);
    expect(env.GIT_TERMINAL_PROMPT).toBe('0');
  });
});
