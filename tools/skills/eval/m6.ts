import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';

import { filesUnder, isSourceFile } from './files.js';
import type { EvalRun, M6Comparison } from './types.js';

function callsInFile(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const bindings = new Map<string, { module: string; imported?: string; namespace?: boolean }>();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const module = statement.moduleSpecifier.text;
    if (!module.startsWith('@gm/pack-')) continue;
    const clause = statement.importClause;
    if (!clause) continue;
    if (clause.name) bindings.set(clause.name.text, { module, imported: 'default' });
    if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
      bindings.set(clause.namedBindings.name.text, { module, namespace: true });
    } else if (clause.namedBindings) {
      for (const element of clause.namedBindings.elements) {
        bindings.set(element.name.text, { module, imported: (element.propertyName ?? element.name).text });
      }
    }
  }

  const calls = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression)) {
        const binding = bindings.get(node.expression.text);
        if (binding?.imported) calls.add(`${binding.module}#${binding.imported}`);
      } else if (ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression)) {
        const binding = bindings.get(node.expression.expression.text);
        if (binding?.namespace) calls.add(`${binding.module}#${node.expression.name.text}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...calls];
}

/** Stable nested paths from a `renderGameToText()` value; arrays use `[]` rather than per-run indexes. */
export function flattenRenderKeys(value: unknown): string[] {
  const keys = new Set<string>();
  const visit = (current: unknown, prefix: string): void => {
    if (!current || typeof current !== 'object') return;
    if (Array.isArray(current)) {
      const path = `${prefix}[]`;
      if (prefix) keys.add(path);
      for (const item of current) visit(item, path);
      return;
    }
    for (const [name, child] of Object.entries(current as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${name}` : name;
      keys.add(path);
      visit(child, path);
    }
  };
  visit(value, '');
  return [...keys].sort();
}

export async function collectM6Signature(gameDir: string, renderState: unknown): Promise<EvalRun['m6']> {
  const adapterCalls = new Set(filesUnder(join(gameDir, 'src'), isSourceFile).flatMap(callsInFile));
  return { adapterCalls: [...adapterCalls].sort(), renderKeys: flattenRenderKeys(renderState) };
}

function collisions(runs: EvalRun[], select: (run: EvalRun) => string[]): string[][] {
  const bySignature = new Map<string, string[]>();
  for (const run of runs) {
    const signature = JSON.stringify(select(run));
    bySignature.set(signature, [...(bySignature.get(signature) ?? []), run.brief]);
  }
  return [...bySignature.values()].filter((briefs) => briefs.length > 1).map((briefs) => briefs.sort());
}

/** M6 is a set metric: each config needs distinct adapter-call and text-key signatures across its games. */
export function compareM6(runs: EvalRun[]): M6Comparison {
  if (runs.length < 2) return { passed: true, adapterCollisions: [], renderKeyCollisions: [] };
  const adapterCollisions = collisions(runs, (run) => run.m6.adapterCalls);
  const renderKeyCollisions = collisions(runs, (run) => run.m6.renderKeys);
  return {
    passed: adapterCollisions.length === 0 && renderKeyCollisions.length === 0,
    adapterCollisions,
    renderKeyCollisions,
  };
}
