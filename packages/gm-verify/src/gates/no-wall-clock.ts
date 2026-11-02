import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import * as ts from 'typescript';

export type WallClockFinding = {
  file: string;
  line: number;
  col: number;
  what: 'Math.random' | 'Date.now' | 'performance.now' | 'new Date';
};

const EXCLUDED_SYSTEMS = new Set(['render', 'ui', 'audio']);
const BANNED_PROPERTIES = new Map([
  ['Math.random', 'Math.random'],
  ['Date.now', 'Date.now'],
  ['performance.now', 'performance.now'],
] as const);

function slash(path: string): string {
  return path.split(sep).join('/');
}

function excluded(path: string): boolean {
  const parts = slash(path).split('/');
  const src = parts.lastIndexOf('src');
  return src >= 0 && EXCLUDED_SYSTEMS.has(parts[src + 1] ?? '');
}

export function scanFile(file: string, text: string): WallClockFinding[] {
  const optedOut = text.split(/\r?\n/, 3).some((line) => /^\s*\/\/\s*gm: nondeterministic ok\b/.test(line));
  if (excluded(file) || optedOut) return [];

  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const findings: WallClockFinding[] = [];
  const add = (node: ts.Node, what: WallClockFinding['what']) => {
    const position = source.getLineAndCharacterOfPosition(node.getStart(source));
    findings.push({ file: slash(file), line: position.line + 1, col: position.character + 1, what });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const what = BANNED_PROPERTIES.get(
        node.expression.getText(source) as 'Math.random' | 'Date.now' | 'performance.now',
      );
      if (what) add(node, what);
    } else if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'Date' &&
      (node.arguments?.length ?? 0) === 0
    ) {
      add(node, 'new Date');
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') files.push(...sourceFiles(path));
    } else if (
      entry.isFile() &&
      /\.(?:mts|cts|tsx?|jsx?)$/.test(entry.name) &&
      !/\.(?:spec|test)\.[^.]+$/.test(entry.name)
    ) {
      files.push(path);
    }
  }
  return files;
}

export function scanRepo(root: string): WallClockFinding[] {
  const src = join(root, 'src');
  const files = sourceFiles(src);
  return files.sort().flatMap((path) => scanFile(slash(relative(root, path)), readFileSync(path, 'utf8')));
}
