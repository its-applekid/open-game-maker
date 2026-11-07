import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  FEEDBACK_FILE,
  appendRejection,
  breaksMust,
  checkOption,
  checkOptions,
  readLedger,
  rejectionEntry,
  sharesFlaw,
  type FeedbackLedger,
  type OptionProvenance,
} from '../src/ledger/index.js';
import { tempDir } from './helpers.js';

const AT = '2026-11-07T16:20:00.000Z';

function provenance(overrides: Partial<OptionProvenance> = {}): OptionProvenance {
  return {
    packs: ['kaykit'],
    assets: ['kaykit/knight'],
    generator: 'blender 4.2',
    built_at: AT,
    aspect: 'look',
    kind: 'render',
    view: 'player',
    ...overrides,
  };
}

function standIn(overrides: Partial<OptionProvenance> = {}): OptionProvenance {
  return {
    packs: ['stand-in'],
    assets: ['stand-in/box'],
    generator: 'stand-in',
    built_at: AT,
    aspect: 'look',
    kind: 'stand-in',
    view: 'off-camera',
    ...overrides,
  };
}

function ledgerWith(...entries: ReturnType<typeof rejectionEntry>[]): FeedbackLedger {
  return { schemaVersion: 1, entries };
}

const rejection = rejectionEntry({
  id: 'fb_01JBX2R1A2B3C4D5E6F7G8H9JK',
  now: AT,
  words: 'those are not characters',
  rule: 'characters are rigged KayKit models',
  scope: 'characters',
  must: { packs: ['kaykit'] },
  designVersion: '1.2.3',
  rejected: {
    options: [{ id: 'a', label: 'Stand-in A', provenance: standIn({ aspect: 'characters' }) }],
    command: 'cp_01',
    media: ['m_01'],
  },
  withdrawn: { options: ['a'], commands: ['cp_01'] },
});

describe('the creator feedback ledger', () => {
  it('reads as empty for a game that has never recorded a rejection', () => {
    expect(readLedger(tempDir())).toEqual({ schemaVersion: 1, entries: [] });
  });

  it('writes one entry per rejection and keeps the earlier ones', () => {
    const game = tempDir();
    appendRejection(game, {
      words: 'those are not characters',
      rule: 'characters are rigged KayKit models',
      scope: 'characters',
      rejected: { options: [{ id: 'a', label: 'Stand-in A' }], command: 'cp_01', media: ['m_01'] },
      withdrawn: { options: ['a'], commands: ['cp_01'] },
      now: AT,
      id: 'fb_01JBX2R1A2B3C4D5E6F7G8H9JK',
    });
    const second = appendRejection(game, {
      words: 'never off-camera',
      rule: 'options are player-view mockups',
      scope: 'options',
      rejected: { options: [{ id: 'b', label: 'Behind camera' }], command: null, media: [] },
      withdrawn: { options: [], commands: [] },
      now: AT,
      id: 'fb_01JBX2R1A2B3C4D5E6F7G8H9JM',
    });

    expect(second.ledger.entries).toHaveLength(2);
    expect(readLedger(game)).toEqual(second.ledger);
    expect(readLedger(game).entries[0]).toMatchObject({
      words: 'those are not characters',
      rule: 'characters are rigged KayKit models',
      scope: 'characters',
      design_version: '0.0.0',
      rejected: { options: [{ id: 'a', label: 'Stand-in A' }], command: 'cp_01', media: ['m_01'] },
      withdrawn: { options: ['a'], commands: ['cp_01'] },
    });
  });

  it('refuses a ledger file that is not the ledger shape', () => {
    const game = tempDir();
    mkdirSync(join(game, 'design'), { recursive: true });
    writeFileSync(join(game, FEEDBACK_FILE), JSON.stringify({ schemaVersion: 2, entries: [] }));
    expect(() => readLedger(game)).toThrow(/not a valid ledger/);
  });

  it('treats the same generator and the same packs as the same flaw under a new name', () => {
    expect(sharesFlaw(standIn(), standIn({ assets: ['stand-in/sphere'] }))).toBe(true);
    expect(sharesFlaw(standIn(), provenance())).toBe(false);
    expect(sharesFlaw(standIn(), standIn({ generator: 'blender 4.2' }))).toBe(false);
    expect(sharesFlaw(standIn({ packs: [] }), standIn({ packs: [] }))).toBe(false);
  });

  it('fails an option whose packs sit outside the rule', () => {
    expect(breaksMust({ packs: ['kaykit'] }, standIn())).toBe(true);
    expect(breaksMust({ packs: ['kaykit'] }, provenance())).toBe(false);
    expect(breaksMust({ packs: ['kaykit'] }, provenance({ packs: [] }))).toBe(true);
    expect(breaksMust({ views: ['player'] }, standIn())).toBe(true);
    expect(breaksMust({ kinds: ['render'] }, provenance())).toBe(false);
    expect(breaksMust({}, standIn())).toBe(false);
  });
});

describe('checking an option against the ledger', () => {
  const ledger = ledgerWith(rejection);

  it('fails the rejected option id', () => {
    const violations = checkOption(
      { id: 'a', label: 'Stand-in A', provenance: standIn({ aspect: 'characters' }) },
      ledger,
    );
    expect(new Set(violations.map((violation) => violation.kind))).toEqual(
      new Set(['withdrawn', 'rejected', 'breaks-rule']),
    );
  });

  it('fails an option built the same way even under a new id', () => {
    const violations = checkOption({ id: 'z', label: 'Stand-in Z', provenance: standIn() }, ledger);
    expect(violations.some((violation) => violation.kind === 'rejected')).toBe(true);
  });

  it('passes a KayKit option that satisfies the rule', () => {
    expect(checkOption({ id: 'b', label: 'KayKit knight', provenance: provenance() }, ledger)).toEqual([]);
  });

  it('fails a withdrawn Command even when the option looks clean', () => {
    const violations = checkOption(
      { id: 'b', label: 'KayKit knight', command: 'cp_01', provenance: provenance() },
      ledger,
    );
    expect(violations).toMatchObject([{ kind: 'withdrawn', option_id: 'b' }]);
  });

  it('fails an option with no provenance once the game carries a ledger', () => {
    expect(checkOption({ id: 'c', label: 'Mystery' }, ledger)).toMatchObject([{ kind: 'missing-provenance' }]);
  });

  it('fails an option built before a rule that applies to it', () => {
    const early = checkOption(
      {
        id: 'c',
        label: 'Older character',
        provenance: provenance({ aspect: 'characters', built_at: '2026-11-01T00:00:00.000Z' }),
      },
      ledger,
    );
    expect(early).toMatchObject([{ kind: 'predates-rule' }]);
  });

  it('applies a scope to matching options only', () => {
    const characters = { id: 'c', label: 'Look', provenance: provenance({ aspect: 'look' as const }) };
    expect(checkOption(characters, ledger)).toEqual([]);
    const all = ledgerWith(
      rejectionEntry({
        id: 'fb_01JBX2R1A2B3C4D5E6F7G8H9JM',
        now: AT,
        words: 'never off-camera',
        rule: 'options are player-view mockups',
        scope: 'options',
        must: { views: ['player'] },
        rejected: { options: [], command: null, media: [] },
        withdrawn: { options: [], commands: [] },
      }),
    );
    expect(checkOption(characters, all)).toEqual([]);
    expect(
      checkOption({ ...characters, provenance: provenance({ view: 'off-camera' }) }, all).map((item) => item.kind),
    ).toEqual(['breaks-rule']);
  });

  it('reports every violation across a set of options', () => {
    const result = checkOptions(
      [
        { id: 'b', label: 'KayKit knight', provenance: provenance() },
        { id: 'a', label: 'Stand-in A', provenance: standIn() },
      ],
      ledger,
    );
    expect(result.ok).toBe(false);
    expect(new Set(result.violations.map((violation) => violation.option_id))).toEqual(new Set(['a']));
  });

  it('checks nothing when the game has no ledger', () => {
    expect(checkOptions([{ id: 'a', label: 'Anything' }], { schemaVersion: 1, entries: [] })).toEqual({
      ok: true,
      violations: [],
    });
  });
});
