import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Workspace } from './graph.js';
import { ReleaseError } from './graph.js';
import type { RegistryProfile } from './profile.js';
import { destinationNames, npmrcLines, registryHost } from './profile.js';
import type { RunCommand } from './run.js';
import { packTarball, stagePackage } from './stage.js';
import { coreVersion, shortCoreSha } from './version.js';

export type ReleaseEntry = {
  readonly source: string;
  readonly name: string;
  readonly version: string;
  readonly files: readonly string[];
  readonly dependencies: Readonly<Record<string, string>>;
  readonly tarball: string;
  readonly bytes: number;
  readonly integrity: string;
};

export type ReleasePlan = {
  readonly coreSha: string;
  readonly profile: RegistryProfile;
  readonly names: ReadonlyMap<string, string>;
  readonly versions: ReadonlyMap<string, string>;
  readonly entries: readonly ReleaseEntry[];
};

export type PlanInput = {
  readonly workspace: Workspace;
  readonly order: readonly string[];
  readonly profile: RegistryProfile;
  readonly coreSha: string;
  readonly stagingRoot: string;
  readonly outDir: string;
  readonly run: RunCommand;
};

/** `sha512-<base64>`, the integrity form a registry reports in `dist.integrity`. */
export function integrityOf(bytes: Buffer): string {
  return `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
}

export function packumentUrl(profile: RegistryProfile, name: string): string {
  return `${profile.registry}/${name.replace('/', '%2f')}`;
}

/**
 * Stages and packs every package in the closure, leaves first. No network call and no token: this is
 * what a dry run prints and what a real run then publishes in the same order.
 */
export async function planRelease(input: PlanInput): Promise<ReleasePlan> {
  const { workspace, order, profile, coreSha, stagingRoot, outDir, run } = input;
  shortCoreSha(coreSha);

  const names = destinationNames(order, profile);
  const versions = new Map<string, string>();
  for (const name of order) {
    const pkg = workspace.packages.get(name);
    if (pkg === undefined) throw new ReleaseError(`${name} is not a workspace package`);
    versions.set(name, coreVersion(pkg.version, coreSha));
  }

  const seen = new Set<string>();
  for (const [source, name] of names) {
    const key = `${name}@${versions.get(source) ?? ''}`;
    if (seen.has(key)) throw new ReleaseError(`two packages would publish as ${key}`);
    seen.add(key);
  }

  const entries: ReleaseEntry[] = [];
  for (const source of order) {
    const pkg = workspace.packages.get(source);
    if (pkg === undefined) throw new ReleaseError(`${source} is not a workspace package`);
    const staged = await stagePackage({ pkg, profile, names, versions, stagingRoot });
    const tarball = await packTarball({ dir: staged.dir, outDir, run });
    const bytes = await readFile(tarball);
    entries.push({
      source,
      name: staged.name,
      version: staged.version,
      files: staged.files,
      dependencies: (staged.manifest.dependencies ?? {}) as Record<string, string>,
      tarball,
      bytes: bytes.byteLength,
      integrity: integrityOf(bytes),
    });
  }

  return { coreSha: coreSha.toLowerCase(), profile, names, versions, entries };
}

export type PublishOutcome = {
  readonly name: string;
  readonly version: string;
  readonly action: 'published' | 'skipped' | 'blocked' | 'failed';
  readonly detail: string;
};

type PackumentVersion = { readonly dist?: { readonly integrity?: string } };
type Packument = { readonly versions?: Readonly<Record<string, PackumentVersion>> };

/** Reads the published versions of a package. A 404 means nothing is published under that name yet. */
export async function readPublished(args: {
  profile: RegistryProfile;
  name: string;
  token: string;
  fetchImpl?: typeof fetch;
}): Promise<Readonly<Record<string, PackumentVersion>>> {
  const response = await (args.fetchImpl ?? fetch)(packumentUrl(args.profile, args.name), {
    headers: { authorization: `Bearer ${args.token}`, accept: 'application/json' },
  });
  if (response.status === 404) return {};
  if (!response.ok) {
    throw new ReleaseError(`reading ${args.name} from ${args.profile.registry} failed (HTTP ${response.status})`);
  }
  const parsed = (await response.json()) as Packument;
  return parsed.versions ?? {};
}

/**
 * Publishes the plan in order. A version that already exists with the same integrity is skipped, so a
 * re-run after a partial failure resumes; a version that exists with different bytes fails closed
 * rather than overwriting an immutable release. The first failure stops the run: a consumer is never
 * published when a package it imports failed.
 */
export async function publishPlan(args: {
  plan: ReleasePlan;
  token: string;
  run: RunCommand;
  authFile: string;
  fetchImpl?: typeof fetch;
  log?: (line: string) => void;
}): Promise<PublishOutcome[]> {
  const { plan, token, run, authFile, fetchImpl } = args;
  const log = args.log ?? (() => {});
  if (token === '') throw new ReleaseError('a publish run needs a publisher token');

  await writeFile(authFile, `${npmrcLines(plan.profile).join('\n')}\n`, { encoding: 'utf8', mode: 0o600 });

  const outcomes: PublishOutcome[] = [];
  let blocked = false;
  for (const entry of plan.entries) {
    if (blocked) {
      outcomes.push({
        name: entry.name,
        version: entry.version,
        action: 'blocked',
        detail: 'an earlier package failed',
      });
      continue;
    }
    let published: Readonly<Record<string, PackumentVersion>>;
    try {
      published = await readPublished({ profile: plan.profile, name: entry.name, token, fetchImpl });
    } catch (error) {
      outcomes.push({ name: entry.name, version: entry.version, action: 'failed', detail: message(error) });
      blocked = true;
      continue;
    }

    const existing = published[entry.version];
    if (existing !== undefined) {
      const integrity = existing.dist?.integrity;
      if (integrity === entry.integrity) {
        outcomes.push({
          name: entry.name,
          version: entry.version,
          action: 'skipped',
          detail: 'already published with the same bytes',
        });
        continue;
      }
      outcomes.push({
        name: entry.name,
        version: entry.version,
        action: 'failed',
        detail: `already published with ${integrity ?? 'an unknown integrity'}; a release version is immutable`,
      });
      blocked = true;
      continue;
    }

    log(`publishing ${entry.name}@${entry.version}`);
    const result = await run(
      'npm',
      [
        'publish',
        entry.tarball,
        '--registry',
        plan.profile.registry,
        '--tag',
        plan.profile.tag,
        '--access',
        plan.profile.access,
      ],
      { cwd: join(entry.tarball, '..'), env: { NODE_AUTH_TOKEN: token, NPM_CONFIG_USERCONFIG: authFile } },
    );
    if (result.code !== 0) {
      outcomes.push({
        name: entry.name,
        version: entry.version,
        action: 'failed',
        detail: tail(result.stderr) || tail(result.stdout),
      });
      blocked = true;
      continue;
    }
    outcomes.push({ name: entry.name, version: entry.version, action: 'published', detail: 'ok' });
  }
  return outcomes;
}

/** The dry-run report: what would be published, in order, with no registry call. */
export function describePlan(plan: ReleasePlan): string[] {
  const lines = [
    `core commit ${plan.coreSha}`,
    `registry ${plan.profile.registry} (scope ${plan.profile.scope}, access ${plan.profile.access}, tag ${plan.profile.tag})`,
    `${plan.entries.length} packages, leaves first:`,
  ];
  plan.entries.forEach((entry, index) => {
    const alias = plan.names.get(entry.source) === entry.source ? '' : ` (from ${entry.source})`;
    lines.push(
      `  ${String(index + 1).padStart(2)}. ${entry.name}@${entry.version}${alias}` +
        ` — ${entry.files.join(', ')} — ${String(entry.bytes)} bytes — ${entry.integrity.slice(0, 24)}…`,
    );
    const dependencies = Object.entries(entry.dependencies);
    if (dependencies.length > 0) {
      lines.push(`      dependencies: ${dependencies.map(([name, spec]) => `${name}@${spec}`).join(', ')}`);
    }
  });
  lines.push('dry run: nothing was published');
  return lines;
}

export async function tarballBytes(path: string): Promise<number> {
  return (await stat(path)).size;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function tail(text: string): string {
  return text.trim().split(/\r?\n/).slice(-3).join(' ').slice(0, 400);
}

export { registryHost };
