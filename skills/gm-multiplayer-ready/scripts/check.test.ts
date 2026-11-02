import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { checkGame, type Rule } from './check.js';

const TEMPLATE = fileURLToPath(new URL('../../../templates/game-multiplayer/', import.meta.url));
const CHECKER = fileURLToPath(new URL('./check.ts', import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), 'gm-mp-check-'));

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/**
 * Fixtures are the shipped template plus one edit, so `good` is always the template itself and each `bad-*` breaks
 * exactly one rule. If the template drifts away from a rule, `good` fails here first.
 */
function fixture(name: string, edit?: (dir: string) => void): string {
  const dir = join(scratch, name);
  cpSync(TEMPLATE, dir, {
    recursive: true,
    filter: (source) => !/[\\/](?:node_modules|dist|test-results)(?:[\\/]|$)/.test(source),
  });
  edit?.(dir);
  return dir;
}

function replaceIn(dir: string, file: string, from: string | RegExp, to: string): void {
  const path = join(dir, file);
  const before = readFileSync(path, 'utf8');
  const after = before.replace(from, to);
  if (after === before) throw new Error(`fixture edit did not apply to ${file}`);
  writeFileSync(path, after);
}

function rulesOf(dir: string): Rule[] {
  return checkGame(dir).findings.map((finding) => finding.rule);
}

describe('gm-multiplayer-ready checker', () => {
  it('passes the game-multiplayer template (good)', () => {
    const result = checkGame(fixture('good'));

    expect(result.findings).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('fails a module-scope player singleton with rule 2, naming file and line (bad-singleton)', () => {
    const dir = fixture('bad-singleton', (root) =>
      replaceIn(root, 'src/state.ts', /^export const spawns/m, 'let player = { x: 0, y: 0 };\nexport const spawns'),
    );
    const [finding, ...rest] = checkGame(dir).findings;

    expect(rest).toEqual([]);
    expect(finding).toMatchObject({ rule: 2, file: 'src/state.ts' });
    expect(finding!.line).toBe(
      readFileSync(join(dir, 'src/state.ts'), 'utf8').split('\n').indexOf('let player = { x: 0, y: 0 };') + 1,
    );
  });

  it('fails fewer spawn points than maxPlayers with rule 4 (bad-spawns)', () => {
    const dir = fixture('bad-spawns', (root) =>
      writeFileSync(join(root, 'design/spawns.json'), '[{ "id": "spawn-a", "x": 96, "y": 400 }]\n'),
    );

    expect(rulesOf(dir)).toEqual([4]);
    expect(checkGame(dir).findings[0]!.message).toContain('maxPlayers 4');
  });

  it('fails entity ids taken from a counter with rule 3 (bad-ids)', () => {
    const dir = fixture('bad-ids', (root) =>
      replaceIn(
        root,
        'src/state.ts',
        /^export const spawns/m,
        'const entities: unknown[] = [];\nlet nextId = 0;\nexport function track(value: unknown): void {\n  entities[nextId++] = value;\n}\nexport const spawns',
      ),
    );

    expect(rulesOf(dir)).toEqual([3]);
  });

  it('fails a game without applyInput with rule 1 (bad-no-applyinput)', () => {
    const dir = fixture('bad-no-applyinput', (root) => {
      replaceIn(root, 'src/state.ts', 'export function applyInput(', 'export function readKeys(');
      replaceIn(root, 'src/game.ts', /\bapplyInput\b/g, 'readKeys');
    });

    expect(rulesOf(dir)).toEqual([1]);
  });

  it('fails a game whose net hooks lose applySnapshot with rule 6', () => {
    const dir = fixture('bad-no-snapshot', (root) =>
      replaceIn(root, 'src/game.ts', 'applySnapshot(snapshot)', 'load(snapshot)'),
    );

    expect(rulesOf(dir)).toEqual([6]);
  });

  it('fails snapshot hooks defined outside the net hooks with rule 6 (bad-decoy-snapshot)', () => {
    /* Moving the hooks off `net` leaves both names in the source; the room would still never sync. */
    const dir = fixture('bad-decoy-snapshot', (root) => {
      replaceIn(root, 'src/game.ts', 'snapshot() {', 'takeState() {');
      replaceIn(root, 'src/game.ts', 'applySnapshot(snapshot) {', 'loadState(snapshot) {');
      replaceIn(
        root,
        'src/state.ts',
        /^export const spawns/m,
        'export const unused = { snapshot() {}, applySnapshot() {} };\nexport const spawns',
      );
    });

    expect(rulesOf(dir)).toEqual([6]);
  });

  it('fails an applyInput that is declared but never called with rule 1 (bad-uncalled-applyinput)', () => {
    const dir = fixture('bad-uncalled-applyinput', (root) =>
      replaceIn(
        root,
        'src/game.ts',
        'for (const frame of frames) applyInput(context.state, frame.playerIndex, frame);',
        'void frames;',
      ),
    );

    expect(rulesOf(dir)).toEqual([1]);
  });

  it.each([
    ['satisfies', 'export const mod = { net: { snapshot() { return {}; }, applySnapshot(s: unknown) { void s; } } satisfies object };'],
    ['variable', 'const hooks = { snapshot() { return {}; }, applySnapshot(s: unknown) { void s; } };\nexport const mod = { net: hooks };'],
    ['class field', 'export class Mod {\n  net = { snapshot() { return {}; }, applySnapshot(s: unknown) { void s; } };\n}'],
    ['assignment', 'export const mod: { net?: object } = {};\nmod.net = { snapshot() { return {}; }, applySnapshot(s: unknown) { void s; } };'],
  ])('passes net hooks written as a %s', (name, hooks) => {
    /* The template's own hooks are renamed away, so only the shape under test can satisfy rule 6. */
    const dir = fixture(`good-net-${name.replace(' ', '-')}`, (root) => {
      replaceIn(root, 'src/game.ts', 'snapshot() {', 'takeState() {');
      replaceIn(root, 'src/game.ts', 'applySnapshot(snapshot) {', 'loadState(snapshot) {');
      writeFileSync(join(root, 'src/net-shape.ts'), `${hooks}\n`);
    });

    expect(rulesOf(dir)).toEqual([]);
  });

  it('passes applyInput called through a namespace import', () => {
    const dir = fixture('good-namespace-applyinput', (root) => {
      replaceIn(root, 'src/game.ts', 'applyInput(context.state,', 'sim.applyInput(context.state,');
      replaceIn(root, 'src/game.ts', /^/, "import * as sim from './state.js';\n");
    });

    expect(rulesOf(dir)).toEqual([]);
  });

  it('fails entities pushed onto an array with rule 3 (bad-entities-push)', () => {
    const dir = fixture('bad-entities-push', (root) =>
      replaceIn(
        root,
        'src/state.ts',
        /^export const spawns/m,
        'const entities: unknown[] = [];\nexport function track(value: unknown): void {\n  entities.push(value);\n}\nexport const spawns',
      ),
    );

    expect(rulesOf(dir)).toEqual([3]);
  });

  it('fails an entity read by array position with rule 3 (bad-ids-index)', () => {
    const dir = fixture('bad-ids-index', (root) =>
      replaceIn(
        root,
        'src/state.ts',
        /^export const spawns/m,
        'const entities: unknown[] = [];\nexport function first(): unknown {\n  return entities[0];\n}\nexport const spawns',
      ),
    );

    expect(rulesOf(dir)).toEqual([3]);
  });

  it('notes, but passes, a host counter turned into a string id (good-counter-string-id)', () => {
    /* The conversion recipe allows a host counter minted as `e<n>`; only a bare counter key fails. */
    const dir = fixture('good-counter-string-id', (root) =>
      replaceIn(
        root,
        'src/state.ts',
        /^export const spawns/m,
        'const entities: Record<string, unknown> = {};\nlet nextId = 0;\nexport function mint(value: unknown): void {\n  entities[`e${nextId++}`] = value;\n}\nexport const spawns',
      ),
    );
    const result = checkGame(dir);

    expect(result.findings).toEqual([]);
    expect(result.notes.map((note) => note.rule)).toEqual([3]);
  });

  it('fails an empty applySnapshot in the net hooks with rule 6, naming its line (bad-empty-hook)', () => {
    const dir = fixture('bad-empty-hook', (root) =>
      replaceIn(root, 'src/game.ts', /^\s*applySnapshotState\(context\.state, snapshot\.state as SerializedSimulation\);\n/m, ''),
    );
    const [finding, ...rest] = checkGame(dir).findings;

    expect(rest).toEqual([]);
    expect(finding).toMatchObject({ rule: 6, file: 'src/game.ts' });
    expect(finding!.message).toContain('applySnapshot() is empty');
  });

  it('fails a missing spawns.json and a non-positive maxPlayers with rule 4', () => {
    const missing = fixture('bad-no-spawns', (root) => rmSync(join(root, 'design/spawns.json')));
    const zero = fixture('bad-max-players', (root) =>
      replaceIn(root, 'gm.manifest.json', /"maxPlayers":\s*4/, '"maxPlayers": 0'),
    );

    expect(rulesOf(missing)).toEqual([4]);
    expect(checkGame(missing).findings[0]!.file).toBe('design/spawns.json');
    expect(rulesOf(zero)).toEqual([4]);
    expect(checkGame(zero).findings[0]!.file).toBe('gm.manifest.json');
  });

  it('fails a HUD that does not read players.get with rule 7', () => {
    const dir = fixture('bad-hud', (root) =>
      replaceIn(
        root,
        'src/hud.ts',
        'const player = players.get(playerIndex);',
        'const player = [...players.values()][0];',
      ),
    );

    expect(rulesOf(dir)).toEqual([7]);
  });

  it('fails a game with no hud at all with rule 7 (bad-no-hud)', () => {
    const dir = fixture('bad-no-hud', (root) => {
      replaceIn(root, 'src/hud.ts', /\bhud\b/g, 'panel');
      replaceIn(root, 'src/game.ts', /\bhud\b/g, 'panel');
    });
    const findings = checkGame(dir).findings;

    expect(findings.map((finding) => finding.rule)).toEqual([7]);
    expect(findings[0]!.line).toBeUndefined();
  });

  it('throws a clear error for a directory without gm.manifest.json', () => {
    expect(() => checkGame(scratch)).toThrow(/gm\.manifest\.json not found/);
  });

  it('runs under plain node, exiting 1 and naming the rule (CLI)', () => {
    const dir = fixture('cli-singleton', (root) =>
      replaceIn(root, 'src/state.ts', /^export const spawns/m, 'let player = { x: 0, y: 0 };\nexport const spawns'),
    );
    const failed = spawnSync(process.execPath, [CHECKER, dir], { encoding: 'utf8' });
    const passed = spawnSync(process.execPath, [CHECKER, fixture('cli-good')], { encoding: 'utf8' });

    expect(failed.status).toBe(1);
    expect(failed.stdout).toMatch(/^rule 2 src\/state\.ts:\d+ /m);
    expect(passed.status).toBe(0);
  }, 30_000);
});
