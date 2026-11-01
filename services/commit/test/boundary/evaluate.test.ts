import { describe, expect, it } from 'vitest';

import type { AssetsLock } from '@ogm/contracts';

import {
  evaluateBoundary,
  evaluateDiff,
  evaluateTree,
  type BoundaryInput,
  type BoundaryRule,
} from '../../src/boundary/index.js';

const emptyLock: AssetsLock = {
  version: 1,
  family: 'any',
  pov: 'iso',
  assets: [],
};

function input(overrides: Partial<Omit<BoundaryInput, 'mode'>> = {}): Omit<BoundaryInput, 'mode'> {
  return {
    actor: 'agent',
    blocklist: new Set(),
    draft: true,
    files: [],
    lockfile: emptyLock,
    profileNames: [],
    visibility: 'private',
    ...overrides,
  };
}

describe('boundary evaluator', () => {
  it('allows a clean diff and tree', () => {
    const clean = input({
      files: [
        {
          path: 'src/game.ts',
          status: 'modified',
          bytes: 20,
          sha256: 'a'.repeat(64),
          binary: false,
          content: 'export const score = 1;\n',
        },
      ],
    });

    expect(evaluateDiff(clean)).toEqual({ allowed: true, reasons: [] });
    expect(evaluateTree({ ...clean, draft: false })).toEqual({ allowed: true, reasons: [] });
  });

  it('runs every rule without short-circuiting', () => {
    const verdict = evaluateTree(
      input({
        draft: false,
        visibility: 'public',
        blocklist: null,
        files: [
          {
            path: '.github/workflows/x.yml',
            status: 'added',
            bytes: 40,
            sha256: 'b'.repeat(64),
            binary: false,
            content: 'token: ghp_abcdefghijklmnopqrstuvwxyz123456\n',
          },
        ],
      }),
    );

    expect(new Set(verdict.reasons.map(({ code }) => code))).toEqual(
      new Set(['path', 'denylist', 'secret']),
    );
  });

  it('keeps fifty reasons and appends an overflow summary', () => {
    const rules: BoundaryRule[] = [() => Array.from({ length: 60 }, (_, index) => ({
      code: 'path' as const,
      detail: `reason ${index + 1}`,
    }))];

    const verdict = evaluateBoundary({ ...input(), mode: 'diff' }, rules);

    expect(verdict.reasons).toHaveLength(51);
    expect(verdict.reasons.at(-1)?.detail).toBe('… and 10 more');
  });

  it('fails a tree without a rights lock', () => {
    expect(evaluateTree(input({ lockfile: null, draft: false }))).toMatchObject({
      allowed: false,
      reasons: [{ code: 'rights', path: 'assets.lock.json', detail: 'assets.lock.json is missing' }],
    });
  });
});
