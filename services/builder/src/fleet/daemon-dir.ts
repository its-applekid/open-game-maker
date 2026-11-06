import { lstat, mkdir, readlink, symlink } from 'node:fs/promises';
import { join } from 'node:path';

import { renderDaemonFiles } from '@ogm/game-repo-template';

import { renderAiurConfig } from '../policy/render.js';
import { renderCodexProfile } from '../policy/profile.js';
import type { RenderInput } from '../policy/types.js';
import { daemonPaths, writeAtomic, type DaemonPaths } from './secrets.js';
import type { DaemonRow, FleetEnv, JobKind } from './types.js';

export type DaemonFiles = { hooks: string; prompt: string };
export type DaemonFilesProvider = (row: DaemonRow) => Promise<DaemonFiles>;

// Each daemon renders its own game's hook and prompt: the hook checks the instance repo out sparsely (this game's
// folder plus `packages/` and the root config) and the prompt carries the game-scope rules.
export const gameRepoDaemonFiles: DaemonFilesProvider = async (row) => renderDaemonFiles({ gameSlug: row.slug });

export function aiurRoot(env: FleetEnv): string {
  return env.aiurRoot ?? join(env.home, 'github/aiur');
}

export function codexHomeFor(env: FleetEnv, slug: string): string {
  return join(env.codexHomeRoot ?? join(env.home, '.config/ogm/codex'), slug);
}

export function codexAuthFor(env: FleetEnv): string {
  return env.codexAuthPath ?? join(env.home, '.config/ogm/codex-gamebuilder/auth.json');
}

export function renderInputFor(
  row: DaemonRow,
  paths: DaemonPaths,
  env: FleetEnv,
  kind: JobKind,
  rows: DaemonRow[],
): RenderInput {
  return {
    repo: row.repo,
    // A game daemon's label prefix is its game slug, so aiur only reads and transitions this game's labels.
    labelPrefix: row.slug,
    workspaceRoot: paths.workspaces,
    port: row.port,
    intakeLogin: env.intakeLogin,
    botAccount: env.builderBotLogin,
    kind,
    maxConcurrentAgents: row.maxConcurrentAgents,
    denyReadRoots: [
      env.assetsLocalDir,
      ...rows.filter((other) => other.slug !== row.slug).map((other) => daemonPaths(env.home, other.slug).workspaces),
    ],
    instanceId: row.slug,
    codexHome: codexHomeFor(env, row.slug),
  };
}

export async function materialize(
  paths: DaemonPaths,
  input: RenderInput,
  files: DaemonFiles,
  authPath: string,
): Promise<void> {
  await mkdir(join(paths.dir, '.aiur'), { recursive: true, mode: 0o700 });
  await mkdir(paths.workspaces, { recursive: true, mode: 0o700 });
  await writeAtomic(join(paths.dir, '.aiur/config'), renderAiurConfig(input), 0o600);
  await writeAtomic(join(paths.dir, '.aiur/hooks'), files.hooks, 0o600);
  await writeAtomic(join(paths.dir, '.aiur/prompt.md'), files.prompt, 0o600);
  await materializeCodexHome(input, authPath);
}

export async function materializeCodexHome(input: RenderInput, authPath: string): Promise<void> {
  const codexHome = input.codexHome;
  if (!codexHome) throw new Error('per-daemon codexHome is required');
  await requireFile(authPath, 'shared Codex auth');
  await writeAtomic(join(codexHome, 'config.toml'), renderCodexProfile(input), 0o600);
  await linkSharedAuth(codexHome, authPath);
}

async function linkSharedAuth(codexHome: string, authPath: string): Promise<void> {
  const link = join(codexHome, 'auth.json');
  try {
    const current = await readlink(link);
    if (current === authPath) return;
    throw new Error(`Codex auth link points to ${current}; expected ${authPath}`);
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      await symlink(authPath, link);
      return;
    }
    if (isNodeError(error) && error.code === 'EINVAL') {
      throw new Error(`Codex auth path is not a symlink: ${link}`, { cause: error });
    }
    throw error;
  }
}

async function requireFile(path: string, label: string): Promise<void> {
  try {
    if (!(await lstat(path)).isFile()) throw new Error(`${label} is not a file: ${path}`);
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT')
      throw new Error(`${label} is missing: ${path}`, { cause: error });
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
