import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { scanFile, type WallClockFinding } from './no-wall-clock.js';

/**
 * Two scans that keep the bad-network simulator test-only (research #499 §3.7, T10):
 *
 * 1. no file under a product app's `src` — a test file excepted — imports the verify package, so the simulator and the
 *    scenarios cannot reach a published build;
 * 2. the simulator's pure half reads no wall clock and no global random source, which is what makes a seed replay.
 */

export type ImportFinding = { file: string; line: number; specifier: string };

const SCRIPT = /\.(?:mts|cts|tsx?|jsx?|mjs|cjs)$/;
const TEST_FILE = /(?:\.(?:spec|test)\.|(?:^|\/)__tests__\/)/;

function slash(path: string): string {
  return path.split(sep).join('/');
}

function files(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') found.push(...files(path));
    } else if (entry.isFile() && SCRIPT.test(entry.name)) {
      found.push(path);
    }
  }
  return found;
}

const STATIC_IMPORT = /(?:^|[^.\w$])(?:import|export)\b[^;'"`]*?from\s*['"`]([^'"`]+)['"`]/g;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
const REQUIRE = /\brequire\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;

/** Every import specifier of `packageName`, in files that ship. Test files are excluded: a test may import a scenario. */
export function scanPackageImports(root: string, packageName: string): ImportFinding[] {
  const findings: ImportFinding[] = [];
  const matches = (specifier: string) => specifier === packageName || specifier.startsWith(`${packageName}/`);

  for (const path of files(root).sort()) {
    const relativePath = slash(relative(root, path));
    if (TEST_FILE.test(relativePath)) continue;
    const text = readFileSync(path, 'utf8');
    for (const pattern of [STATIC_IMPORT, DYNAMIC_IMPORT, REQUIRE]) {
      for (const match of text.matchAll(pattern)) {
        const specifier = match[1]!;
        if (!matches(specifier)) continue;
        findings.push({ file: relativePath, line: text.slice(0, match.index).split('\n').length, specifier });
      }
    }
  }
  return findings;
}

/** Wall-clock and global-random reads in every source file under `dir`, reported against `root`'s paths. */
export function scanWallClock(dir: string, root: string): WallClockFinding[] {
  return files(dir)
    .sort()
    .flatMap((path) => scanFile(slash(relative(root, path)), readFileSync(path, 'utf8')));
}
