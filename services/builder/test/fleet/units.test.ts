import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { parse, stringify } from 'yaml';

import { PROBE_TIMEOUT_MS, passes } from '../../src/fleet/health.js';
import { registryPath, writeRegistry } from '../../src/fleet/registry.js';
import { codexHomeFor } from '../../src/fleet/daemon-dir.js';
import { daemonPaths, writeAtomic, writeDaemonSecrets } from '../../src/fleet/secrets.js';
import { createSystemctl, mintTokens } from '../../src/fleet/systemctl.js';
import { assertTransition, daemonSlugFor } from '../../src/fleet/types.js';
import { cleanupHomes, fakeRunner, fleetEnv, liveRow, systemctlCalls, tempHome } from './helpers.js';

afterEach(cleanupHomes);

async function withTempHomeFixture(run: (fixture: string) => Promise<void>): Promise<void> {
  const fixture = await mkdtemp(join(tmpdir(), 'ogm-temp-home-test-'));
  try {
    await run(fixture);
  } finally {
    vi.unstubAllEnvs();
    await cleanupHomes();
    await rm(fixture, { recursive: true, force: true });
  }
}

describe('tempHome', () => {
  it('uses OGM_TEST_HOME without writing to HOME or TMPDIR', async () => {
    await withTempHomeFixture(async (fixture) => {
      const scratch = join(fixture, 'scratch');
      const home = join(fixture, 'home');
      const temporary = join(fixture, 'tmp');
      await Promise.all([mkdir(home), mkdir(temporary)]);
      vi.stubEnv('OGM_TEST_HOME', scratch);
      vi.stubEnv('HOME', home);
      vi.stubEnv('TMPDIR', temporary);
      const created = await tempHome();

      expect(dirname(created)).toBe(resolve(scratch));
      expect(await readdir(home)).toEqual([]);
      expect(await readdir(temporary)).toEqual([]);
      expect((await stat(created)).mode & 0o777).toBe(0o700);
      expect((await stat(join(created, '.config/ogm/codex-gamebuilder/auth.json'))).mode & 0o777).toBe(0o600);
    });
  });

  it('uses writable TMPDIR when OGM_TEST_HOME is unset', async () => {
    await withTempHomeFixture(async (fixture) => {
      const home = join(fixture, 'home');
      const temporary = join(fixture, 'tmp');
      await Promise.all([mkdir(home), mkdir(temporary)]);
      vi.stubEnv('HOME', home);
      vi.stubEnv('TMPDIR', temporary);
      vi.stubEnv('OGM_TEST_HOME', undefined);
      const created = await tempHome();

      expect(dirname(created)).toBe(resolve(temporary));
      expect(await readdir(home)).toEqual([]);
    });
  });

  it('falls back to the home cache when TMPDIR is not writable', async () => {
    await withTempHomeFixture(async (fixture) => {
      const home = join(fixture, 'home');
      const unwritable = join(fixture, 'unwritable');
      await Promise.all([mkdir(home), mkdir(unwritable)]);
      await chmod(unwritable, 0o500);
      vi.stubEnv('HOME', home);
      vi.stubEnv('TMPDIR', unwritable);
      vi.stubEnv('OGM_TEST_HOME', undefined);
      const created = await tempHome();

      expect(dirname(created)).toBe(resolve(home, '.cache'));
    });
  });
});

describe('daemonSlugFor', () => {
  it('keys a daemon by the game slug, lower-cased, because the unit and the label prefix use it', () => {
    expect(daemonSlugFor('Castle-Run')).toBe('castle-run');
  });

  it('refuses a slug that cannot name a unit or a label prefix', () => {
    for (const bad of ['Castle_Run', 'castle run', '-castle', 'castle-', 'castle--run', '']) {
      expect(() => daemonSlugFor(bad)).toThrow(/cannot key a daemon/);
    }
    expect(() => daemonSlugFor('a'.repeat(49))).toThrow(/longer than 48 characters/);
  });
});

describe('assertTransition', () => {
  it('rejects a stopped daemon jumping straight to running', () => {
    expect(() => assertTransition('stopped', 'running')).toThrow('stopped -> running');
    expect(() => assertTransition('running', 'idle')).not.toThrow();
  });
});

describe('writeDaemonSecrets', () => {
  it('writes only the daemon names, never the commit token or a provider key', async () => {
    const home = await tempHome();
    const paths = daemonPaths(home, 'owner-game');
    process.env.OGM_COMMIT_SERVICE_TOKEN = 'commit-secret';
    process.env.OPENAI_API_KEY = 'sk-test';
    try {
      const env = fleetEnv(home, { apiPort: 8787 });
      await writeDaemonSecrets(paths, env, codexHomeFor(env, 'owner-game'));
    } finally {
      delete process.env.OGM_COMMIT_SERVICE_TOKEN;
      delete process.env.OPENAI_API_KEY;
    }

    const text = await readFile(paths.envFile, 'utf8');
    expect(
      text
        .trim()
        .split('\n')
        .map((line) => line.split('=')[0]),
    ).toEqual([
      'AIUR_ERLANG_COOKIE',
      'GITHUB_TOKEN',
      'CODEX_HOME',
      'AIUR_SECRETS_FROM_ENV',
      'AIUR_GITHUB_ALLOW_PAT',
      'OGM_HOOK_SECRET_FILE',
      'OGM_INTERNAL_URL',
    ]);
    expect(text).not.toMatch(/OGM_COMMIT_SERVICE_TOKEN|_API_KEY|commit-secret|sk-test/);
    expect(text).toContain('GITHUB_TOKEN=ghp_builder\n');
    expect(text).toMatch(/^AIUR_ERLANG_COOKIE=[0-9a-f]{64}$/m);
    expect((await stat(paths.envFile)).mode & 0o777).toBe(0o600);
    expect((await stat(paths.hookSecret)).mode & 0o777).toBe(0o600);
  });

  it('keeps the cookie and hook secret across rewrites', async () => {
    const home = await tempHome();
    const paths = daemonPaths(home, 'owner-game');
    const env = fleetEnv(home);
    await writeDaemonSecrets(paths, env, codexHomeFor(env, 'owner-game'));
    const envText = await readFile(paths.envFile, 'utf8');
    const hook = await readFile(paths.hookSecret, 'utf8');

    await writeDaemonSecrets(paths, env, codexHomeFor(env, 'owner-game'));

    expect(await readFile(paths.envFile, 'utf8')).toBe(envText);
    expect(await readFile(paths.hookSecret, 'utf8')).toBe(hook);
  });
});

describe('createSystemctl', () => {
  it('invokes exactly systemctl --user <verb> ogm-aiur@<slug>.service', async () => {
    const runner = fakeRunner();
    const systemctl = createSystemctl(runner);
    await systemctl.start('x');
    await systemctl.stop('x');
    await expect(systemctl.isActive('x')).resolves.toBe(true);
    expect(systemctlCalls(runner)).toEqual([
      '--user start ogm-aiur@x.service',
      '--user stop ogm-aiur@x.service',
      '--user is-active ogm-aiur@x.service',
    ]);
  });

  it('throws when systemctl fails', async () => {
    const systemctl = createSystemctl(async () => ({ code: 5, stdout: '', stderr: 'Unit not found.' }));
    await expect(systemctl.start('x')).rejects.toThrow('exited 5: Unit not found.');
  });
});

describe('mintTokens', () => {
  it('stores each printed token with mode 0600 and keeps existing tokens', async () => {
    const home = await tempHome();
    const paths = daemonPaths(home, 'owner-game');
    const runner = fakeRunner();

    await expect(mintTokens(runner, paths, join(home, 'github/aiur'), {})).resolves.toEqual({
      clientToken: 'aiur_token1',
    });
    expect(await readFile(paths.clientToken, 'utf8')).toBe('aiur_token1\n');
    expect((await stat(paths.readToken)).mode & 0o777).toBe(0o600);
    expect(runner.calls[1]).toMatchObject({
      cmd: join(home, 'github/aiur/scripts/aiurdev'),
      args: ['token', 'create', 'ogm-api', '--scope', 'write'],
      cwd: paths.dir,
    });

    await mintTokens(runner, paths, join(home, 'github/aiur'), {});
    expect(runner.calls.filter((call) => call.args[1] === 'create')).toHaveLength(2);
  });

  it('fails when aiurdev prints no token', async () => {
    const home = await tempHome();
    const runner = async () => ({ code: 1, stdout: '', stderr: 'boom' });
    await expect(mintTokens(runner, daemonPaths(home, 'g'), home, {})).rejects.toThrow('token create ogm-api failed');
  });
});

describe('writeRegistry', () => {
  it('round-trips daemon entries and preserves foreign instances', async () => {
    const home = await tempHome();
    const nuc = { url: 'https://nuc.example.ts.net', token_env: 'AIUR_TOKEN_NUC' };
    await writeAtomic(registryPath(home), stringify({ version: 1, instances: { nuc } }), 0o600);

    await writeRegistry(home, [liveRow(1)]);
    await writeRegistry(home, [liveRow(1), liveRow(2)]);

    const registry = parse(await readFile(registryPath(home), 'utf8'));
    expect(registry).toEqual({
      version: 1,
      instances: {
        nuc,
        'owner-game1': { url: 'http://127.0.0.1:4101', token_file: '~/.config/ogm/daemons/owner-game1/read-token' },
        'owner-game2': { url: 'http://127.0.0.1:4102', token_file: '~/.config/ogm/daemons/owner-game2/read-token' },
      },
    });
  });

  it('creates the file when none exists', async () => {
    const home = await tempHome();
    await writeRegistry(home, [liveRow(3)]);
    expect(parse(await readFile(registryPath(home), 'utf8')).instances['owner-game3'].url).toBe(
      'http://127.0.0.1:4103',
    );
  });
});

describe('passes', () => {
  it('counts a health check that never answers as a miss after the probe timeout', async () => {
    vi.useFakeTimers();
    try {
      const result = passes(() => new Promise<boolean>(() => undefined));
      await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS);
      await expect(result).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
