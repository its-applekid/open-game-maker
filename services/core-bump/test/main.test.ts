import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { InstanceGitHub } from '../src/github.js';
import { main } from '../src/main.js';
import { harness, NEW, OLD, TOKEN } from './harness.js';

const ENV = {
  OGM_CORE_BUMP_REPOS: 'its-everdred/open-games',
  OGM_CORE_BUMP_CORE_REPO: 'its-everdred/open-game-maker',
  GITHUB_APP_ID: '1234',
  GITHUB_APP_INSTALLATION_ID: '5678',
  GITHUB_APP_PRIVATE_KEY_PATH: '/home/<user>/.config/ogm/app.pem',
};

async function env() {
  return { ...ENV, OGM_CORE_BUMP_WORK_DIR: await mkdtemp(join(tmpdir(), 'ogm-core-bump-main-')) };
}

function github(init: { pin?: string | null; fail?: boolean } = {}): InstanceGitHub {
  return {
    async defaultBranch() {
      if (init.fail === true) throw new Error('the App is not installed');
      return 'main';
    },
    async readFile() {
      return init.pin === undefined ? JSON.stringify({ core: { sha: OLD } }) : init.pin;
    },
    async openPullWithPrefix() {
      return null;
    },
    async createPull() {
      return { number: 7, url: 'https://github.com/its-everdred/open-games/pull/7' };
    },
    async botIdentity() {
      return { name: 'ogm-bot[bot]', email: 'ogm-bot[bot]@users.noreply.github.com' };
    },
    async installationToken() {
      return TOKEN;
    },
  };
}

function deps(port: InstanceGitHub, lines: string[]) {
  return {
    run: harness().run,
    out: (line: string) => lines.push(line),
    connect: async () => ({
      core: { headSha: async () => NEW },
      github: port,
    }),
  };
}

describe('main', () => {
  it('opens a bump pull request and exits 0', async () => {
    const lines: string[] = [];

    expect(await main(await env(), deps(github(), lines))).toBe(0);
    expect(lines).toEqual([
      'core-bump its-everdred/open-games: opened https://github.com/its-everdred/open-games/pull/7 ' +
        `from core-bump/${NEW.slice(0, 12)} (pin ${NEW.slice(0, 12)})`,
    ]);
  });

  it('exits 1 when an instance repository fails', async () => {
    const lines: string[] = [];

    expect(await main(await env(), deps(github({ fail: true }), lines))).toBe(1);
    expect(lines).toEqual(['core-bump its-everdred/open-games: error the App is not installed']);
  });

  it('says nothing to do when every pin is current', async () => {
    const lines: string[] = [];

    expect(await main(await env(), deps(github({ pin: JSON.stringify({ core: { sha: NEW } }) }), lines))).toBe(0);
    expect(lines[0]).toContain('current');
  });

  it('exits 1 when the pull request client cannot be built', async () => {
    const lines: string[] = [];

    const code = await main(await env(), {
      run: harness().run,
      out: (line: string) => lines.push(line),
      connect: async () => {
        throw new Error('the GitHub App private key is unreadable');
      },
    });

    expect(code).toBe(1);
    expect(lines).toEqual(['core-bump: the GitHub App private key is unreadable']);
  });

  it('exits 2 without connecting when the configuration is incomplete', async () => {
    const lines: string[] = [];

    expect(await main({ ...(await env()), OGM_CORE_BUMP_REPOS: '' }, deps(github(), lines))).toBe(2);
    expect(lines[0]).toMatch(/^core-bump: /);
  });
});
