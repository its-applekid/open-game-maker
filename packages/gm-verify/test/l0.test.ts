import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { checkHookPresence, runL0 } from '../src/gates/l0-static.js';

const FIXTURES = fileURLToPath(new URL('../fixtures/', import.meta.url));
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

describe('L0 static gate', () => {
  it('surfaces TypeScript diagnostics with a relative file and line', () => {
    const result = runL0(join(FIXTURES, 'type-error'), { checks: ['typecheck'] });

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(
      expect.objectContaining({ id: 'typecheck', ok: false, file: 'src/main.ts', line: 1 }),
    );
  }, 60_000);

  it('fails when a GameModule is never wired through SDK boot or direct hook registration', () => {
    expect(checkHookPresence(join(FIXTURES, 'no-hooks'))).toEqual(
      expect.objectContaining({ id: 'hook-present', ok: false, file: 'src/main.ts' }),
    );
  });

  it('does not mistake comments or strings for hook wiring', () => {
    const root = mkdtempSync(join(tmpdir(), 'gm-l0-comments-'));
    mkdirSync(join(root, 'src'));
    writeFileSync(
      join(root, 'src/main.ts'),
      [
        'type GameModule = { mount(): void };',
        'export const module: GameModule = { mount() {} };',
        '// import { boot } from "@gm/sdk/core"; boot(module);',
        'export const example = "host.test.register(module)";',
        'const fake = { test: { register() {} } }; fake.test.register(module);',
      ].join('\n'),
    );

    expect(checkHookPresence(root)).toEqual(
      expect.objectContaining({ id: 'hook-present', ok: false, file: 'src/main.ts' }),
    );
  });

  it('accepts direct registration only through the host test surface', () => {
    const root = mkdtempSync(join(tmpdir(), 'gm-l0-register-'));
    mkdirSync(join(root, 'src'));
    writeFileSync(
      join(root, 'src/main.ts'),
      [
        'type GameModule = { mount(): void };',
        'declare const host: { test: { register(module: GameModule): void } };',
        'export const module: GameModule = { mount() {} };',
        'host.test.register(module);',
      ].join('\n'),
    );

    expect(checkHookPresence(root)).toEqual({ id: 'hook-present', ok: true });
  });

  it('fails closed when the source tree cannot be scanned', () => {
    const root = mkdtempSync(join(tmpdir(), 'gm-l0-unreadable-'));
    writeFileSync(join(root, 'src'), 'not a directory');

    expect(runL0(root, { checks: ['no-wall-clock-in-sim'] }).checks).toEqual([
      { id: 'no-wall-clock-in-sim', ok: false, detail: 'unavailable: src directory' },
    ]);
  });

  it('accepts the landed template wiring where SDK boot registers the hooks', () => {
    expect(checkHookPresence(join(ROOT, 'templates/game-3d'))).toEqual(
      expect.objectContaining({ id: 'hook-present', ok: true }),
    );
  });

  it('returns one successful wall-clock check for a clean source tree', () => {
    const result = runL0(join(FIXTURES, 'sim-ok'), { checks: ['no-wall-clock-in-sim'] });

    expect(result).toMatchObject({ gate: 'L0', ok: true });
    expect(result.checks).toEqual([{ id: 'no-wall-clock-in-sim', ok: true }]);
  });
});
