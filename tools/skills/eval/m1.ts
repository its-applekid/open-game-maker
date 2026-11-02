import { mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { EvalRun } from './types.js';

interface ReportFile {
  name: string;
  start: number;
  end: number;
}

interface Clone {
  firstFile: ReportFile;
  secondFile: ReportFile;
  fragment: string;
  lines: number;
  tokens: number;
}

interface JscpdReport {
  duplicates: Clone[];
  statistics: { total: { tokens: number } };
}

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const binary = join(packageRoot, 'node_modules/.bin', process.platform === 'win32' ? 'jscpd.cmd' : 'jscpd');

function reportPath(output: string, name: string): string {
  return join(output, `${name}.json`);
}

function runJscpd(paths: string[], output: string, name: string, minTokens: number): JscpdReport {
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  const result = spawnSync(
    binary,
    [
      ...paths,
      '--min-tokens',
      String(minTokens),
      '--min-lines',
      '1',
      '--reporters',
      'json',
      '--report-name',
      name,
      '--output',
      output,
      '--absolute',
      '--no-gitignore',
      '--silent',
    ],
    { encoding: 'utf8', timeout: 120_000, maxBuffer: 10 * 1024 * 1024 },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`jscpd exited ${result.status}: ${(result.stderr || result.stdout).trim()}`);
  const file = reportPath(output, name);
  if (!statSync(file, { throwIfNoEntry: false })?.isFile()) {
    return { duplicates: [], statistics: { total: { tokens: 0 } } };
  }
  return JSON.parse(readFileSync(file, 'utf8')) as JscpdReport;
}

function isWithin(root: string, path: string): boolean {
  const nested = relative(resolve(root), resolve(path));
  return nested === '' || (!nested.startsWith('..') && !isAbsolute(nested));
}

function gameSide(clone: Clone, gameSource: string): ReportFile | undefined {
  const first = resolve(clone.firstFile.name);
  const second = resolve(clone.secondFile.name);
  const firstGame = isWithin(gameSource, first);
  const secondGame = isWithin(gameSource, second);
  if (firstGame === secondGame) return undefined;
  return firstGame ? clone.firstFile : clone.secondFile;
}

function referenceSide(clone: Clone, gameSource: string): ReportFile | undefined {
  const game = gameSide(clone, gameSource);
  if (!game) return undefined;
  return game === clone.firstFile ? clone.secondFile : clone.firstFile;
}

function crossClones(gameDir: string, referenceDirs: string[], output: string, name: string): Clone[] {
  const gameSource = join(gameDir, 'src');
  const paths = [gameSource, ...referenceDirs].filter((path) =>
    statSync(path, { throwIfNoEntry: false })?.isDirectory(),
  );
  if (paths.length < 2) return [];
  return runJscpd(paths, output, name, 30).duplicates.filter((clone) => gameSide(clone, gameSource));
}

/** M1 is duplicated game tokens against card/corpus references, excluding fragments also present in a fresh scaffold. */
export async function calculateM1(options: {
  gameDir: string;
  referenceDirs: string[];
  freshDir?: string;
  workDir: string;
}): Promise<EvalRun['m1']> {
  mkdirSync(options.workDir, { recursive: true });
  const clones = crossClones(options.gameDir, options.referenceDirs, join(options.workDir, 'cross'), 'cross');
  const scaffoldFragments = new Set(
    options.freshDir
      ? crossClones(options.freshDir, options.referenceDirs, join(options.workDir, 'fresh'), 'fresh').map(
          (clone) => clone.fragment,
        )
      : [],
  );
  const gameSource = join(options.gameDir, 'src');
  const kept = clones.filter((clone) => !scaffoldFragments.has(clone.fragment));
  const spans = new Map<string, { tokens: number; lines: number; file: string }>();
  for (const clone of kept) {
    const side = gameSide(clone, gameSource);
    if (!side) continue;
    const gameFile = resolve(side.name);
    const key = `${gameFile}:${side.start}:${side.end}`;
    const existing = spans.get(key);
    if (!existing || clone.tokens > existing.tokens) {
      const reference = referenceSide(clone, gameSource)!;
      spans.set(key, {
        tokens: clone.tokens,
        lines: clone.lines,
        file: relative(options.gameDir, resolve(reference.name)),
      });
    }
  }
  const total = statSync(gameSource, { throwIfNoEntry: false })?.isDirectory()
    ? runJscpd([gameSource], join(options.workDir, 'total'), 'total', 1).statistics.total.tokens
    : 0;
  const duplicated = [...spans.values()].reduce((sum, span) => sum + span.tokens, 0);
  const largest = [...spans.values()].sort((a, b) => b.tokens - a.tokens)[0];
  return {
    duplicatedPct: total === 0 ? 0 : Math.min(100, Math.round((duplicated / total) * 10_000) / 100),
    ...(largest ? { largestClone: { file: largest.file.split('\\').join('/'), lines: largest.lines } } : {}),
  };
}
