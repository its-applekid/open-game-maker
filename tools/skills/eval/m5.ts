import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';

import { filesUnder } from './files.js';

function numberValues(text: string): number[] {
  return [...text.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0])).filter(Number.isFinite);
}

function cardExamples(roots: string[]): Map<string, Set<number>> {
  const examples = new Map<string, Set<number>>();
  for (const file of roots.flatMap((root) => filesUnder(root, (name) => name.endsWith('.md')))) {
    const text = readFileSync(file, 'utf8');
    const names = [...text.matchAll(/\bname:\s*([A-Za-z_$][\w$]*)/g)].map((match) => match[1]);
    const testHeading = /^## Test\s*$/m.exec(text);
    const afterHeading = testHeading ? text.slice(testHeading.index + testHeading[0].length) : '';
    const nextHeading = /^## /m.exec(afterHeading);
    const test = afterHeading.slice(0, nextHeading?.index ?? afterHeading.length);
    const prose = text.replace(/^---\s*$[\s\S]*?^---\s*$/m, '').replace(/^```[\s\S]*?^```\s*$/gm, '');
    for (const name of names) {
      const values = examples.get(name) ?? new Set<number>();
      for (const line of `${test}\n${prose}`.split('\n')) {
        if (!line.includes(name)) continue;
        for (const value of numberValues(line)) if (value !== 0) values.add(value);
      }
      examples.set(name, values);
    }
  }
  return examples;
}

function propertyName(node: ts.ObjectLiteralElementLike): string | undefined {
  if (!node.name) return undefined;
  if (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) || ts.isNumericLiteral(node.name))
    return node.name.text;
  return undefined;
}

function unwrap(node: ts.Expression): ts.Expression {
  while (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isNonNullExpression(node)
  )
    node = node.expression;
  return node;
}

function numeric(node: ts.Expression): number | undefined {
  node = unwrap(node);
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (ts.isPrefixUnaryExpression(node)) {
    const value = numeric(node.operand);
    if (value === undefined) return undefined;
    if (node.operator === ts.SyntaxKind.MinusToken) return -value;
    if (node.operator === ts.SyntaxKind.PlusToken) return value;
  }
  if (ts.isBinaryExpression(node)) {
    const left = numeric(node.left);
    const right = numeric(node.right);
    if (left === undefined || right === undefined) return undefined;
    switch (node.operatorToken.kind) {
      case ts.SyntaxKind.PlusToken:
        return left + right;
      case ts.SyntaxKind.MinusToken:
        return left - right;
      case ts.SyntaxKind.AsteriskToken:
        return left * right;
      case ts.SyntaxKind.SlashToken:
        return right === 0 ? undefined : left / right;
      case ts.SyntaxKind.AsteriskAsteriskToken:
        return left ** right;
      default:
        return undefined;
    }
  }
  return undefined;
}

function gameTunables(file: string): Map<string, number> {
  if (!statSync(file, { throwIfNoEntry: false })?.isFile()) return new Map();
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const values = new Map<string, number>();
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== 'tunables') continue;
      if (!declaration.initializer) continue;
      const initializer = unwrap(declaration.initializer);
      if (!ts.isObjectLiteralExpression(initializer)) continue;
      for (const property of initializer.properties) {
        if (!ts.isPropertyAssignment(property)) continue;
        const name = propertyName(property);
        const value = numeric(property.initializer);
        if (name !== undefined && value !== undefined) values.set(name, value);
      }
    }
  }
  return values;
}

export async function calculateM5(
  gameDir: string,
  cardRoots: string[],
): Promise<{ total: number; equalToCardExample: number }> {
  const tunables = gameTunables(join(gameDir, 'src/tunables.ts'));
  const examples = cardExamples(cardRoots);
  let equalToCardExample = 0;
  for (const [name, value] of tunables) if (examples.get(name)?.has(value)) equalToCardExample += 1;
  return { total: tunables.size, equalToCardExample };
}
