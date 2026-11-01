import { execFile } from 'node:child_process';
import { join } from 'node:path';

import { readIfPresent, writeAtomic, type DaemonPaths } from './secrets.js';

export type RunResult = { code: number; stdout: string; stderr: string };
// `env` holds extra variables layered over the inherited environment.
export type Runner = (
  cmd: string,
  args: string[],
  opts?: { cwd?: string; env?: Record<string, string> },
) => Promise<RunResult>;

export const nodeRunner: Runner = (cmd, args, opts = {}) =>
  new Promise((resolve) => {
    // Passes the inherited environment through to the child untouched; no value is read here.
    // eslint-disable-next-line no-restricted-properties
    const env = opts.env ? { ...process.env, ...opts.env } : undefined;
    execFile(cmd, args, { cwd: opts.cwd, env, encoding: 'utf8' }, (error, stdout, stderr) => {
      const code = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
      resolve({ code, stdout, stderr });
    });
  });

export type Systemctl = {
  start(slug: string): Promise<void>;
  stop(slug: string): Promise<void>;
  restart(slug: string): Promise<void>;
  isActive(slug: string): Promise<boolean>;
};

export function unitName(slug: string): string {
  return `ogm-aiur@${slug}.service`;
}

export function createSystemctl(run: Runner): Systemctl {
  async function call(verb: string, slug: string): Promise<void> {
    const result = await run('systemctl', ['--user', verb, unitName(slug)]);
    if (result.code !== 0) {
      throw new Error(`systemctl --user ${verb} ${unitName(slug)} exited ${result.code}: ${result.stderr.trim()}`);
    }
  }

  return {
    start: (slug) => call('start', slug),
    stop: (slug) => call('stop', slug),
    restart: (slug) => call('restart', slug),
    async isActive(slug) {
      return (await run('systemctl', ['--user', 'is-active', unitName(slug)])).code === 0;
    },
  };
}

const TOKEN_LINE = /^aiur_[A-Za-z0-9_-]+$/;

// Mints the API's write token and the operator's read token in the daemon's directory, so their hashes land in
// that instance's state. A token whose file already exists is kept; one whose file was lost is revoked and re-minted.
export async function mintTokens(
  run: Runner,
  paths: DaemonPaths,
  aiurRoot: string,
  env: Record<string, string>,
): Promise<{ clientToken: string }> {
  const aiurdev = join(aiurRoot, 'scripts/aiurdev');
  const options = { cwd: paths.dir, env: { ...env, AIUR_REPO_ROOT: aiurRoot } };

  async function ensure(name: string, scope: 'write' | 'read', file: string): Promise<string> {
    const existing = (await readIfPresent(file))?.trim();
    if (existing) return existing;

    await run(aiurdev, ['token', 'revoke', name], options);
    const result = await run(aiurdev, ['token', 'create', name, '--scope', scope], options);
    const token = result.stdout
      .split('\n')
      .map((line) => line.trim())
      .find((line) => TOKEN_LINE.test(line));
    if (result.code !== 0 || !token) {
      throw new Error(`aiurdev token create ${name} failed (exit ${result.code})`);
    }
    await writeAtomic(file, `${token}\n`, 0o600);
    return token;
  }

  const clientToken = await ensure('ogm-api', 'write', paths.clientToken);
  await ensure('operator', 'read', paths.readToken);
  return { clientToken };
}
