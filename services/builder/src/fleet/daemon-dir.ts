import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { renderAiurConfig } from '../policy/render.js';
import { renderCodexProfile } from '../policy/profile.js';
import type { RenderInput } from '../policy/types.js';
import { writeAtomic, type DaemonPaths } from './secrets.js';
import type { DaemonRow, FleetEnv, JobKind } from './types.js';

export type DaemonFiles = { hooks: string; prompt: string };
export type DaemonFilesProvider = (row: DaemonRow) => Promise<DaemonFiles>;

const DEFAULT_HOOKS = `after_create: |
  git clone "$THIS_REPOSITORY_URL" .
  issue_id="$(basename "$PWD")"
  git checkout -b "aiur/\${issue_id}" "origin/$THIS_BASE_BRANCH"
before_remove: |
  git status --short
`;

// Built-in hooks and prompt until OGM-036's template package provides them.
export function defaultDaemonFiles(env: FleetEnv): DaemonFilesProvider {
  return async () => ({
    hooks: DEFAULT_HOOKS,
    prompt: await readFile(join(aiurRoot(env), 'src/examples/workflows/github-codex.prompt.md'), 'utf8'),
  });
}

export function aiurRoot(env: FleetEnv): string {
  return env.aiurRoot ?? join(env.home, 'github/aiur');
}

export function codexHomeFor(env: FleetEnv): string {
  return env.codexHome ?? join(env.home, '.config/ogm/codex-gamebuilder');
}

// Every daemon shares the gamebuilder CODEX_HOME, so the profile's deny list must be identical fleet-wide.
export function renderInputFor(row: DaemonRow, paths: DaemonPaths, env: FleetEnv, kind: JobKind): RenderInput {
  return {
    repo: row.repo,
    workspaceRoot: paths.workspaces,
    port: row.port,
    intakeLogin: env.intakeLogin,
    botAccount: env.builderBotLogin,
    kind,
    maxConcurrentAgents: row.maxConcurrentAgents,
    denyReadRoots: [env.assetsLocalDir],
    instanceId: row.slug,
    codexHome: codexHomeFor(env),
  };
}

export async function materialize(paths: DaemonPaths, input: RenderInput, files: DaemonFiles): Promise<void> {
  await mkdir(join(paths.dir, '.aiur'), { recursive: true, mode: 0o700 });
  await mkdir(paths.workspaces, { recursive: true, mode: 0o700 });
  await writeAtomic(join(paths.dir, '.aiur/config'), renderAiurConfig(input), 0o600);
  await writeAtomic(join(paths.dir, '.aiur/hooks'), files.hooks, 0o600);
  await writeAtomic(join(paths.dir, '.aiur/prompt.md'), files.prompt, 0o600);
  await writeAtomic(join(input.codexHome as string, 'config.toml'), renderCodexProfile(input), 0o600);
}
