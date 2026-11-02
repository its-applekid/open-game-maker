/**
 * gm-multiplayer-ready static checker. Deterministic: it reads files and the TypeScript AST, never a model.
 * Rules 1, 2, 3, 4, 6 and 7 are checked here; 5 and 8 need two running clients (the two-client scenario).
 *
 *   node .claude/skills/gm-multiplayer-ready/scripts/check.ts <gameDir>
 *
 * Exits 1 and prints `rule N file:line message` for every finding; ambiguous shapes are printed as notes and never fail.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import ts from 'typescript';

export type Rule = 1 | 2 | 3 | 4 | 6 | 7;
export type Finding = { rule: Rule; file: string; line?: number; message: string };
export type CheckResult = { ok: boolean; findings: Finding[]; notes: Finding[] };

const SINGLETON_NAMES = /^(?:local)?player$/i;

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry.name) && !/\.(?:test|spec)\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts'))
      files.push(path);
  }
  return files.sort();
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

function memberName(node: ts.Node): string | undefined {
  if (
    (ts.isMethodDeclaration(node) || ts.isPropertyAssignment(node) || ts.isPropertyDeclaration(node)) &&
    (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))
  )
    return node.name.text;
  if (ts.isShorthandPropertyAssignment(node)) return node.name.text;
  return undefined;
}

function declaredFunctionName(node: ts.Node): string | undefined {
  if (ts.isFunctionDeclaration(node) && node.name) return node.name.text;
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
    if (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) return node.name.text;
  }
  return memberName(node);
}

function containsIncrement(node: ts.Node): boolean {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (
      (ts.isPostfixUnaryExpression(child) || ts.isPrefixUnaryExpression(child)) &&
      (child.operator === ts.SyntaxKind.PlusPlusToken || child.operator === ts.SyntaxKind.MinusMinusToken)
    )
      found = true;
    if (!found) ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function bodyCallsPlayersGet(node: ts.Node): boolean {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (
      ts.isCallExpression(child) &&
      ts.isPropertyAccessExpression(child.expression) &&
      child.expression.name.text === 'get' &&
      /players$/i.test(child.expression.expression.getText())
    )
      found = true;
    if (!found) ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

/**
 * The name an object literal is held under: `net: {...}`, `const net = {...}`, `net = {...}` as a class field,
 * `x.net = {...}`, looking through `as`, `satisfies` and parentheses.
 */
function holderName(literal: ts.ObjectLiteralExpression): string | undefined {
  let holder: ts.Node = literal.parent;
  while (ts.isAsExpression(holder) || ts.isSatisfiesExpression(holder) || ts.isParenthesizedExpression(holder))
    holder = holder.parent;
  if (
    (ts.isPropertyAssignment(holder) || ts.isVariableDeclaration(holder) || ts.isPropertyDeclaration(holder)) &&
    ts.isIdentifier(holder.name)
  )
    return holder.name.text;
  if (ts.isBinaryExpression(holder) && holder.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    const left = holder.left;
    if (ts.isIdentifier(left)) return left.text;
    if (ts.isPropertyAccessExpression(left)) return left.name.text;
  }
  return undefined;
}

/** `net: hooks` points the net hooks at another variable; returns `hooks`. */
function netReference(node: ts.Node): string | undefined {
  if (!ts.isPropertyAssignment(node) || !ts.isIdentifier(node.name) || node.name.text !== 'net') return undefined;
  let value: ts.Expression = node.initializer;
  while (ts.isAsExpression(value) || ts.isSatisfiesExpression(value) || ts.isParenthesizedExpression(value))
    value = value.expression;
  return ts.isIdentifier(value) ? value.text : undefined;
}

/** `applyInput(...)`, `sim.applyInput(...)`, `this.applyInput(...)`, or `applyInput` handed to another call. */
function usesApplyInput(node: ts.Node): boolean {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  if (ts.isIdentifier(callee) && callee.text === 'applyInput') return true;
  if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'applyInput') return true;
  return node.arguments.some(
    (argument) =>
      (ts.isIdentifier(argument) && argument.text === 'applyInput') ||
      (ts.isPropertyAccessExpression(argument) && argument.name.text === 'applyInput'),
  );
}

function isEntitiesTarget(node: ts.Expression): boolean {
  const text = ts.isPropertyAccessExpression(node) ? node.name.text : ts.isIdentifier(node) ? node.text : '';
  return text === 'entities';
}

export function checkGame(dir: string): CheckResult {
  const manifestPath = join(dir, 'gm.manifest.json');
  if (!existsSync(manifestPath) || !statSync(manifestPath).isFile()) {
    throw new Error(`gm.manifest.json not found in ${dir}; run the checker on a game directory`);
  }
  const findings: Finding[] = [];
  const notes: Finding[] = [];
  const rel = (path: string) => relative(dir, path).split(sep).join('/');

  const manifest = readJson(manifestPath) as { maxPlayers?: unknown };
  const maxPlayers = manifest.maxPlayers;
  const spawnsPath = join(dir, 'design', 'spawns.json');
  if (typeof maxPlayers !== 'number' || !Number.isInteger(maxPlayers) || maxPlayers < 1) {
    findings.push({ rule: 4, file: 'gm.manifest.json', message: 'maxPlayers must be a positive integer' });
  } else if (!existsSync(spawnsPath)) {
    findings.push({
      rule: 4,
      file: 'design/spawns.json',
      message: `missing; needs at least ${maxPlayers} spawn points`,
    });
  } else {
    const spawns = readJson(spawnsPath);
    const count = Array.isArray(spawns) ? spawns.length : 0;
    if (count < maxPlayers) {
      findings.push({
        rule: 4,
        file: 'design/spawns.json',
        message: `${count} spawn point(s) for maxPlayers ${maxPlayers}; add one per seat`,
      });
    }
  }

  let applyInputCalled = false;
  /* Hook names per holder name; rule 6 passes when `net` (or the variable `net:` points at) has both. */
  const hooksByHolder = new Map<string, Set<string>>();
  const netHolders = new Set(['net']);
  const huds: { file: string; line: number; readsPlayer: boolean }[] = [];

  for (const path of sourceFiles(join(dir, 'src'))) {
    const text = readFileSync(path, 'utf8');
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    const file = rel(path);
    const lineOf = (node: ts.Node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

    for (const statement of source.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !SINGLETON_NAMES.test(declaration.name.text)) continue;
        const initializer = declaration.initializer;
        const isMap =
          initializer !== undefined && ts.isNewExpression(initializer) && initializer.expression.getText() === 'Map';
        if (isMap) continue;
        findings.push({
          rule: 2,
          file,
          line: lineOf(declaration),
          message: `module-scope "${declaration.name.text}" singleton; keep players in players: Map<playerIndex, PlayerState>`,
        });
      }
    }

    const visit = (node: ts.Node): void => {
      const name = declaredFunctionName(node);
      if (usesApplyInput(node)) applyInputCalled = true;
      const reference = netReference(node);
      if (reference) netHolders.add(reference);
      if ((name === 'snapshot' || name === 'applySnapshot') && ts.isObjectLiteralExpression(node.parent)) {
        const holder = holderName(node.parent);
        if (holder) hooksByHolder.set(holder, (hooksByHolder.get(holder) ?? new Set()).add(name));
      }
      if (name === 'hud') {
        huds.push({ file, line: lineOf(node), readsPlayer: bodyCallsPlayersGet(node) });
      }

      if (ts.isElementAccessExpression(node) && isEntitiesTarget(node.expression)) {
        const argument = node.argumentExpression;
        if (ts.isNumericLiteral(argument) || containsIncrement(argument)) {
          findings.push({
            rule: 3,
            file,
            line: lineOf(node),
            message: 'entity id from an array position or counter; use a host-minted string id',
          });
        }
      }
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'push' &&
        isEntitiesTarget(node.expression.expression)
      ) {
        findings.push({
          rule: 3,
          file,
          line: lineOf(node),
          message: 'entities kept as an array; key them by host-minted string id',
        });
      }
      if (
        ts.isPropertyAssignment(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === 'id' &&
        (ts.isNumericLiteral(node.initializer) || containsIncrement(node.initializer))
      ) {
        notes.push({
          rule: 3,
          file,
          line: lineOf(node),
          message: 'id built from a number or counter; make sure it is host-minted and globally unique',
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  if (!applyInputCalled) {
    findings.push({
      rule: 1,
      file: 'src',
      message:
        'no applyInput(state, playerIndex, frame) call; input must reach the world only through it in the fixed step',
    });
  }
  const netHooksComplete = [...netHolders].some((holder) => {
    const hooks = hooksByHolder.get(holder);
    return hooks?.has('snapshot') === true && hooks.has('applySnapshot');
  });
  if (!netHooksComplete) {
    findings.push({
      rule: 6,
      file: 'src',
      message: 'the net hooks must define snapshot() and applySnapshot() and cover everything visible',
    });
  }
  if (huds.length === 0) {
    findings.push({ rule: 7, file: 'src', message: 'no hud(playerIndex); the HUD must read players.get(playerIndex)' });
  } else if (!huds.some((entry) => entry.readsPlayer)) {
    /* A hook may delegate to a hud() helper, so only a codebase where no hud() reads the map fails. */
    findings.push({
      rule: 7,
      file: huds[0]!.file,
      line: huds[0]!.line,
      message: 'no hud() reads players.get(playerIndex)',
    });
  }

  return { ok: findings.length === 0, findings, notes };
}

export function formatFinding(finding: Finding): string {
  const at = finding.line === undefined ? finding.file : `${finding.file}:${finding.line}`;
  return `rule ${finding.rule} ${at} ${finding.message}`;
}

function main(argv: string[]): number {
  const dir = argv[0];
  if (!dir) {
    console.error('usage: node check.ts <gameDir>');
    return 2;
  }
  let result: CheckResult;
  try {
    result = checkGame(dir);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
  for (const finding of result.findings) console.log(formatFinding(finding));
  for (const note of result.notes) console.log(`note ${formatFinding(note)}`);
  if (result.ok) console.log('multiplayer-ready: rules 1, 2, 3, 4, 6, 7 pass (5 and 8 need the two-client verify)');
  return result.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
