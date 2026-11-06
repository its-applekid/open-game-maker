import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { ReleaseError, loadWorkspace, releaseOrder } from './graph.js';
import { describePlan, planRelease, publishPlan } from './publish.js';
import { registryProfile, type RegistryProfile } from './profile.js';
import { DEFAULT_ROOTS } from './roots.js';
import { runCommand, type RunCommand } from './run.js';
import { applySwitch, planSwitch } from './switch.js';
import { coreVersion, readCorePin } from './version.js';

const HELP = `core-release — prepare core package publishing (dry run by default)

  core-release publish [--root <dir>] [--registry <url>] [--scope <@owner>] [--access restricted|public]
                       [--tag <dist-tag>] [--core-sha <40-hex>] [--roots <a,b>] [--apply]
  core-release switch  --dir <instance-repo> [--root <dir>] [--registry <url>] [--scope <@owner>]
                       [--access restricted|public] [--tag <dist-tag>] [--core-sha <40-hex>] [--roots <a,b>] [--apply]

publish  stages and packs the core dependency closure, leaves first. Without --apply it publishes nothing.
switch   plans the move of an instance repository from vendored core tarballs to registry versions.
         Without --apply it writes nothing and prints the diff.

Both commands are dry runs unless --apply is passed. A publish run reads its token from the environment
(default CORE_PACKAGES_PUBLISH_TOKEN); no token is created, logged or committed.`;

export type CliOptions = {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly run?: RunCommand;
  readonly log?: (line: string) => void;
  readonly cwd?: string;
};

function defaultScope(env: Readonly<Record<string, string | undefined>>): string {
  const owner = env.GITHUB_REPOSITORY_OWNER;
  if (owner === undefined || owner === '') {
    throw new ReleaseError('no scope: pass --scope @owner (GITHUB_REPOSITORY_OWNER is not set)');
  }
  return `@${owner}`;
}

async function gitHead(root: string, run: RunCommand): Promise<string> {
  const result = await run('git', ['rev-parse', 'HEAD'], { cwd: root, env: {} });
  if (result.code !== 0)
    throw new ReleaseError(`git rev-parse HEAD failed in ${root}: ${result.stderr.trim().slice(0, 200)}`);
  return result.stdout.trim();
}

export async function main(argv: readonly string[], options: CliOptions = {}): Promise<number> {
  const log = options.log ?? ((line: string) => process.stdout.write(`${line}\n`));
  const run = options.run ?? runCommand;
  const env = options.env ?? {};
  const cwd = options.cwd ?? process.cwd();

  const parsed = parseArgs({
    args: [...argv],
    allowPositionals: true,
    strict: true,
    options: {
      root: { type: 'string' },
      dir: { type: 'string' },
      registry: { type: 'string' },
      scope: { type: 'string' },
      access: { type: 'string' },
      tag: { type: 'string' },
      'core-sha': { type: 'string' },
      roots: { type: 'string' },
      'token-variable': { type: 'string' },
      'auth-file': { type: 'string' },
      apply: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      help: { type: 'boolean' },
    },
  });

  const command = parsed.positionals[0];
  if (parsed.values.help === true || command === undefined) {
    log(HELP);
    return parsed.values.help === true ? 0 : 2;
  }
  if (parsed.values.apply === true && parsed.values['dry-run'] === true) {
    throw new ReleaseError('pass --apply or --dry-run, not both');
  }
  const dryRun = parsed.values.apply !== true;

  const profile: RegistryProfile = registryProfile({
    registry: parsed.values.registry,
    scope: parsed.values.scope ?? defaultScope(env),
    access: parsed.values.access,
    tag: parsed.values.tag,
  });
  const roots =
    parsed.values.roots === undefined
      ? DEFAULT_ROOTS
      : parsed.values.roots
          .split(',')
          .map((name) => name.trim())
          .filter(Boolean);

  const root = parsed.values.root ?? cwd;
  const workspace = await loadWorkspace(root, run);
  const order = releaseOrder(workspace, roots).map((pkg) => pkg.name);
  const explicitSha = parsed.values['core-sha'];

  if (command === 'publish') {
    const coreSha = explicitSha ?? (await gitHead(root, run));
    const stagingRoot = await mkdtemp(join(tmpdir(), 'core-release-stage-'));
    const outDir = await mkdtemp(join(tmpdir(), 'core-release-pack-'));
    const plan = await planRelease({ workspace, order, profile, coreSha, stagingRoot, outDir, run });
    for (const line of describePlan(plan)) log(line);

    if (dryRun) {
      log(`dry run: ${order.length} packages would be published from ${coreSha} to ${profile.registry}`);
      return 0;
    }

    const tokenVariable = parsed.values['token-variable'] ?? 'CORE_PACKAGES_PUBLISH_TOKEN';
    const token = env[tokenVariable] ?? '';
    if (token === '') {
      throw new ReleaseError(`a publish run needs ${tokenVariable} in the environment (dry runs do not)`);
    }
    const authFile = parsed.values['auth-file'] ?? join(stagingRoot, 'npmrc');
    const outcomes = await publishPlan({ plan, token, run, authFile, log });
    for (const outcome of outcomes) log(`${outcome.action} ${outcome.name}@${outcome.version}: ${outcome.detail}`);
    const failed = outcomes.filter((outcome) => outcome.action === 'failed' || outcome.action === 'blocked');
    return failed.length === 0 ? 0 : 1;
  }

  if (command === 'switch') {
    const dir = parsed.values.dir;
    if (dir === undefined) throw new ReleaseError('switch needs --dir <instance-repo>');
    // The default pin is the instance repository's own: the same commit its tarballs came from.
    const coreSha = explicitSha ?? (await pinnedCommit(dir, root, run));
    const versions = versionsFrom(workspace, order, coreSha);
    const plan = await planSwitch({ dir, profile, versions, coreSha });
    log(
      `switch ${dir}: pin ${plan.pin.slice(0, 12)}, ${plan.dependencies.length} dependencies in ${plan.edits.length} manifests`,
    );
    for (const edit of plan.dependencies) log(`  ${edit.manifest}: ${edit.dependency} ${edit.from} -> ${edit.to}`);
    for (const deletion of plan.deletions) log(`  delete ${deletion}`);
    for (const note of plan.notes) log(`  note: ${note}`);
    if (plan.diff !== '') log(plan.diff.trimEnd());

    if (dryRun) {
      log('dry run: nothing written (pass --apply to write this plan)');
      return 0;
    }
    await applySwitch(plan);
    log(`wrote ${plan.edits.length} manifests, .npmrc, removed ${plan.deletions.length} tarballs`);
    return 0;
  }

  throw new ReleaseError(`unknown command ${command}; run core-release --help`);
}

/** The instance repository's `vendor/core.json` pin, or the core checkout's head when it has none. */
async function pinnedCommit(dir: string, root: string, run: RunCommand): Promise<string> {
  const text = await readFile(join(dir, 'vendor', 'core.json'), 'utf8').catch(() => null);
  if (text !== null) {
    const read = readCorePin(text);
    if (read.ok) return read.pin.sha;
  }
  return gitHead(root, run);
}

function versionsFrom(
  workspace: Awaited<ReturnType<typeof loadWorkspace>>,
  order: readonly string[],
  coreSha: string,
): Map<string, string> {
  return new Map(order.map((name) => [name, coreVersion(workspace.packages.get(name)?.version ?? '0.0.0', coreSha)]));
}

export type { RegistryProfile };
