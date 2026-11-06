import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { describeDiagnosis, diagnose, missingPinMessage } from './diagnose.js';
import { ReleaseError, loadWorkspace, releaseOrder } from './graph.js';
import { describePlan, planRelease, publishPlan, verifyOidc } from './publish.js';
import {
  DEFAULT_ACCESS,
  DEFAULT_REGISTRY,
  DEFAULT_SCOPE,
  TRUSTED_PUBLISHING_HOST,
  registryHost,
  registryProfile,
  type RegistryProfile,
} from './profile.js';
import { DEFAULT_ROOTS } from './roots.js';
import { runCommand, type RunCommand } from './run.js';
import { applySwitch, planSwitch } from './switch.js';
import { coreVersion, readCorePin } from './version.js';

const HELP = `core-release — prepare core package publishing (dry run by default)

  core-release publish [--root <dir>] [--registry <url>] [--scope <@owner>] [--access public|restricted]
                       [--tag <dist-tag>] [--core-sha <40-hex>] [--repository <url>] [--roots <a,b>]
                       [--verify-oidc] [--apply]
  core-release switch  --dir <instance-repo> [--root <dir>] [--registry <url>] [--scope <@owner>]
                       [--access public|restricted] [--tag <dist-tag>] [--core-sha <40-hex>] [--roots <a,b>] [--apply]
  core-release diagnose --dir <instance-repo|standalone-game> [--registry <url>] [--scope <@owner>] [--online]

publish  stages and packs the core dependency closure, leaves first. Without --apply it publishes nothing.
         --verify-oidc additionally proves the npm trusted publisher with a per-package
         \`npm publish --dry-run\` and still publishes nothing.
switch   plans the move of an instance repository from vendored core tarballs to registry versions and
         records the released version set in vendor/core-packages.json. Without --apply it writes nothing
         and prints the diff. A standalone game repository with no vendor/core.json needs --core-sha.
diagnose reads an instance or standalone game repository and reports what would stop an install: legacy
         local core specifiers, a missing/malformed/stale version set, version drift, an .npmrc without the
         registry block, orphaned tarballs and lockfile entries without integrity. Read-only; exits 1 when
         it reports an error. --online also asks the registry whether each version is published.

Both commands are dry runs unless --apply is passed. Defaults: registry ${DEFAULT_REGISTRY}, scope
${DEFAULT_SCOPE}, access ${DEFAULT_ACCESS}. A publish run authenticates with npm OIDC trusted publishing and
needs no token; a token is only read from the environment (default CORE_PACKAGES_PUBLISH_TOKEN) when one is
present, for a registry that has no trusted publisher.`;

export type CliOptions = {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly run?: RunCommand;
  readonly log?: (line: string) => void;
  readonly cwd?: string;
  /** Replaces the registry client in tests; production uses the global `fetch`. */
  readonly fetchImpl?: typeof fetch;
};

/** The core repository the tarballs point at; npm matches it against the trusted publisher's repo. */
function defaultRepository(env: Readonly<Record<string, string | undefined>>): string | undefined {
  const slug = env.GITHUB_REPOSITORY;
  if (slug === undefined || slug === '') return undefined;
  return `https://github.com/${slug}`;
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
  const fetchImpl = options.fetchImpl;

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
      repository: { type: 'string' },
      roots: { type: 'string' },
      'token-variable': { type: 'string' },
      'auth-file': { type: 'string' },
      'verify-oidc': { type: 'boolean' },
      online: { type: 'boolean' },
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
    scope: parsed.values.scope ?? DEFAULT_SCOPE,
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
  const explicitSha = parsed.values['core-sha'];
  // Loading the core workspace is only needed by the commands that read its package graph; diagnose
  // reads an instance repository and must work without a core checkout.
  const core = async (): Promise<{ workspace: Awaited<ReturnType<typeof loadWorkspace>>; order: string[] }> => {
    const workspace = await loadWorkspace(root, run);
    return { workspace, order: releaseOrder(workspace, roots).map((pkg) => pkg.name) };
  };

  if (command === 'publish') {
    const { workspace, order } = await core();
    const coreSha = explicitSha ?? (await gitHead(root, run));
    const stagingRoot = await mkdtemp(join(tmpdir(), 'core-release-stage-'));
    const outDir = await mkdtemp(join(tmpdir(), 'core-release-pack-'));
    const repository = parsed.values.repository ?? defaultRepository(env);
    const plan = await planRelease({ workspace, order, profile, coreSha, stagingRoot, outDir, run, repository });
    for (const line of describePlan(plan)) log(line);

    if (parsed.values['verify-oidc'] === true) {
      const checks = await verifyOidc({ plan, run, log });
      for (const check of checks) {
        log(`trusted publisher ${check.ok ? 'ok' : 'FAILED'} ${check.name}@${check.version}: ${check.detail}`);
      }
      if (checks.some((check) => !check.ok)) return 1;
      if (dryRun) {
        log(`dry run: the trusted publisher answered; nothing was published (${checks.length} packages)`);
        return 0;
      }
    }

    if (dryRun) {
      log(`dry run: ${order.length} packages would be published from ${coreSha} to ${profile.registry}`);
      return 0;
    }

    const tokenVariable = parsed.values['token-variable'] ?? 'CORE_PACKAGES_PUBLISH_TOKEN';
    const token = env[tokenVariable] ?? '';
    if (token === '' && registryHost(profile) !== TRUSTED_PUBLISHING_HOST) {
      throw new ReleaseError(
        `a publish run to ${registryHost(profile)} needs ${tokenVariable} in the environment; ` +
          'only registry.npmjs.org authenticates with OIDC',
      );
    }
    const authFile = parsed.values['auth-file'] ?? join(stagingRoot, 'npmrc');
    const outcomes = await publishPlan({
      plan,
      run,
      token: token === '' ? undefined : token,
      authFile: token === '' ? undefined : authFile,
      fetchImpl,
      log,
    });
    for (const outcome of outcomes) log(`${outcome.action} ${outcome.name}@${outcome.version}: ${outcome.detail}`);
    const failed = outcomes.filter((outcome) => outcome.action === 'failed' || outcome.action === 'blocked');
    return failed.length === 0 ? 0 : 1;
  }

  if (command === 'switch') {
    const dir = parsed.values.dir;
    if (dir === undefined) throw new ReleaseError('switch needs --dir <instance-repo>');
    // The default pin is the instance repository's own: the same commit its tarballs came from. A
    // standalone game repository that has no pin must name the commit instead of inheriting the head.
    const hasPin = await readFile(join(dir, 'vendor', 'core.json'), 'utf8').then(
      () => true,
      () => false,
    );
    if (!hasPin && explicitSha === undefined) throw new ReleaseError(missingPinMessage(dir));
    const coreSha = explicitSha ?? (await pinnedCommit(dir, root, run));
    const { workspace, order } = await core();
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
    log(
      `wrote ${plan.edits.length} manifests, .npmrc, ${plan.releaseSet.path}, removed ${plan.deletions.length} tarballs`,
    );
    return 0;
  }

  if (command === 'diagnose') {
    const dir = parsed.values.dir;
    if (dir === undefined) throw new ReleaseError('diagnose needs --dir <instance-repo|standalone-game>');
    const diagnosis = await diagnose({
      dir,
      destination: { registry: profile.registry, scope: profile.scope },
      online: parsed.values.online === true,
      ...(fetchImpl === undefined ? {} : { fetchImpl }),
    });
    for (const line of describeDiagnosis(diagnosis)) log(line);
    const errors = diagnosis.findings.filter((finding) => finding.severity === 'error').length;
    return errors === 0 ? 0 : 1;
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
