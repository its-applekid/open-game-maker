import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { parse, stringify } from 'yaml';

import { registryPath, writeRegistry } from '../../src/fleet/registry.js';
import { daemonPaths, writeAtomic, writeDaemonSecrets } from '../../src/fleet/secrets.js';
import { createSystemctl, mintTokens } from '../../src/fleet/systemctl.js';
import { assertTransition, slugFor } from '../../src/fleet/types.js';
import { cleanupHomes, fakeRunner, fleetEnv, liveRow, systemctlCalls, tempHome } from './helpers.js';

afterEach(cleanupHomes);

describe('slugFor', () => {
  it('lower-cases owner and name into [a-z0-9-]', () => {
    expect(slugFor('Everdred-Games/Castle_Run')).toBe('everdred-games-castle-run');
  });

  it('truncates long names to 48 characters with a hash suffix that keeps them unique', () => {
    const a = slugFor(`owner/${'a'.repeat(60)}`);
    const b = slugFor(`owner/${'a'.repeat(59)}b`);
    expect(a).toHaveLength(48);
    expect(a).toMatch(/^[a-z0-9-]+$/);
    expect(a).not.toBe(b);
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
      await writeDaemonSecrets(paths, fleetEnv(home, { apiPort: 8787 }));
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
    await writeDaemonSecrets(paths, fleetEnv(home));
    const env = await readFile(paths.envFile, 'utf8');
    const hook = await readFile(paths.hookSecret, 'utf8');

    await writeDaemonSecrets(paths, fleetEnv(home));

    expect(await readFile(paths.envFile, 'utf8')).toBe(env);
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
