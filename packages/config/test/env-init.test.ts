import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url));
const binPath = join(packageRoot, 'bin', 'ogm-env-init.mjs');
const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync('/tmp/ogm-config-test-');
  temporaryDirectories.push(directory);
  return directory;
}

function runInitializer(home: string, ...args: string[]) {
  return spawnSync(process.execPath, [binPath, ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, HOME: home },
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('ogm-env-init', () => {
  it('creates a private unit file with generated secrets and no secret output', () => {
    const home = temporaryDirectory();
    const result = runInitializer(home, 'api');
    const envPath = join(home, '.config', 'ogm', 'env', 'api.env');

    expect(result.status, result.stderr).toBe(0);
    const contents = readFileSync(envPath, 'utf8');
    expect(statSync(envPath).mode & 0o777).toBe(0o600);
    expect(contents).toContain('OGM_API_PORT=');
    expect(contents).toMatch(/^OGM_BLOB_SIGNING_KEY=[a-f0-9]{64}$/m);
    expect(result.stdout).toContain(`wrote ${envPath}`);
    expect(result.stdout).not.toMatch(/[a-f0-9]{64}/);
  });

  it('refuses to overwrite an existing unit file', () => {
    const home = temporaryDirectory();
    expect(runInitializer(home, 'api').status).toBe(0);
    const envPath = join(home, '.config', 'ogm', 'env', 'api.env');
    const before = readFileSync(envPath, 'utf8');

    const result = runInitializer(home, 'api');

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('refusing to overwrite');
    expect(readFileSync(envPath, 'utf8')).toBe(before);
  });

  it('refuses a target directory inside the repository', () => {
    const home = temporaryDirectory();
    const result = runInitializer(home, 'api', '--dir', join(repositoryRoot, '.aiur-runtime', 'tmp', 'env-init-test'));

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('refusing to write inside the repository');
  });

  it('reuses shared secrets from an existing unit file', () => {
    const home = temporaryDirectory();
    const directory = join(home, '.config', 'ogm', 'env');
    expect(runInitializer(home, 'api').status).toBe(0);
    const apiPath = join(directory, 'api.env');
    const sharedSecret = /^OGM_WS_TOKEN_SECRET=(.*)$/m.exec(readFileSync(apiPath, 'utf8'))?.[1];
    expect(sharedSecret).toMatch(/^[a-f0-9]{64}$/);

    const result = runInitializer(home, 'rooms');
    const roomsContents = readFileSync(join(directory, 'rooms.env'), 'utf8');

    expect(result.status, result.stderr).toBe(0);
    expect(roomsContents).toContain(`OGM_WS_TOKEN_SECRET=${sharedSecret}`);
    expect(result.stdout).not.toContain(sharedSecret);
  });

  it('repairs the file mode when force-writing an existing file', () => {
    const home = temporaryDirectory();
    expect(runInitializer(home, 'api').status).toBe(0);
    const envPath = join(home, '.config', 'ogm', 'env', 'api.env');
    chmodSync(envPath, 0o644);
    writeFileSync(envPath, 'OGM_WS_TOKEN_SECRET=reused-secret-at-least-16\n');

    const result = runInitializer(home, 'api', '--force');

    expect(result.status, result.stderr).toBe(0);
    expect(statSync(envPath).mode & 0o777).toBe(0o600);
  });
});
