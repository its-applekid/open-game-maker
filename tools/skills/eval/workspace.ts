import { cpSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const dataRoot = join(repoRoot, 'evals/skills');
const workspaceParents = ['apps', 'packages', 'services', 'skills', 'templates', 'tools'];

function json<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function workspacePackageDirs(): Map<string, string> {
  const packages = new Map<string, string>();
  for (const parent of workspaceParents) {
    const parentDir = join(repoRoot, parent);
    if (!statSync(parentDir, { throwIfNoEntry: false })?.isDirectory()) continue;
    for (const entry of readdirSync(parentDir)) {
      const dir = join(parentDir, entry);
      const manifest = join(dir, 'package.json');
      if (!statSync(manifest, { throwIfNoEntry: false })?.isFile()) continue;
      const name = json<{ name?: unknown }>(manifest).name;
      if (typeof name === 'string') packages.set(name, dir);
    }
  }
  return packages;
}

function localDependencies(manifest: Record<string, unknown>): string[] {
  return ['dependencies', 'optionalDependencies', 'peerDependencies'].flatMap((section) => {
    const dependencies = manifest[section];
    if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies)) return [];
    return Object.entries(dependencies as Record<string, unknown>)
      .filter(([, version]) => typeof version === 'string' && version.startsWith('workspace:'))
      .map(([name]) => name);
  });
}

/** Keep scratch installs out of the parent monorepo and copy private packages inside the agent's sandbox. */
export function isolateGameWorkspace(gameDir: string, template: 'game-2d' | 'game-3d'): void {
  const localPackages = workspacePackageDirs();
  const packageRoot = join(gameDir, '.ogm-packages');
  mkdirSync(packageRoot, { recursive: true });
  const gameManifestPath = join(gameDir, 'package.json');
  const gameManifest = json<Record<string, unknown>>(gameManifestPath);
  const platformManifest = json<{ devDependencies?: Record<string, string> }>(join(repoRoot, 'package.json'));
  const devDependencies = (gameManifest.devDependencies ??= {}) as Record<string, string>;
  for (const name of ['typescript', '@types/node']) {
    const version = platformManifest.devDependencies?.[name];
    if (version && !devDependencies[name]) devDependencies[name] = version;
  }
  writeFileSync(gameManifestPath, `${JSON.stringify(gameManifest, null, 2)}\n`);

  const tsconfigPath = join(gameDir, 'tsconfig.json');
  if (statSync(tsconfigPath, { throwIfNoEntry: false })?.isFile()) {
    const tsconfig = json<Record<string, unknown>>(tsconfigPath);
    tsconfig.extends = './tsconfig.base.json';
    delete tsconfig.references;
    writeFileSync(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`);
    writeFileSync(join(gameDir, 'tsconfig.base.json'), readFileSync(join(repoRoot, 'tsconfig.base.json'), 'utf8'));
  }

  const queue = localDependencies(gameManifest);
  const copied = new Set<string>();
  for (let index = 0; index < queue.length; index += 1) {
    const name = queue[index]!;
    if (copied.has(name)) continue;
    const source = localPackages.get(name);
    if (!source) throw new Error(`scratch dependency ${name} is not a local workspace package`);
    const destination = join(packageRoot, name.replaceAll('/', '__').replace(/^@/, ''));
    cpSync(source, destination, {
      recursive: true,
      filter: (path) => !path.split('/').includes('node_modules'),
    });
    const manifestPath = join(destination, 'package.json');
    const manifest = json<Record<string, unknown>>(manifestPath);
    delete manifest.devDependencies;
    delete manifest.scripts;
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    copied.add(name);
    for (const dependency of localDependencies(manifest)) {
      if (!copied.has(dependency)) queue.push(dependency);
    }
  }
  writeFileSync(join(gameDir, 'pnpm-workspace.yaml'), "packages:\n  - '.'\n  - '.ogm-packages/*'\n");
  writeFileSync(join(gameDir, 'pnpm-lock.yaml'), readFileSync(join(dataRoot, `locks/${template}.yaml`), 'utf8'));
}
