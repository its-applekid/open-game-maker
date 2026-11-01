import { describe, expect, it } from 'vitest';

import type { AssetsLock, LockEntry } from '@ogm/contracts';
import type { ResolvedCard } from '@ogm/asset-cards';

import { intersectLockRights, refusalsForCheck, refusalsForUse } from '../src/rules.js';

function card(overrides: Partial<ResolvedCard> = {}): ResolvedCard {
  return {
    schema: 'ogm.asset-card/1.1',
    vocab: '2026-10-26',
    id: 't1:fixture/orc@1',
    card_type: 'asset',
    status: 'reviewed',
    title: 'Orc',
    kind: 'model',
    subkind: 'character',
    source: {
      files: [{ path: 'orc.glb', sha256: `sha256:${'0'.repeat(64)}`, bytes: 1, format: 'glb', role: 'primary' }],
    },
    provenance: {},
    resolved: {
      license: 'CC0-1.0',
      rights: {
        uses: ['in-game', 'placeholder'],
        audience: 'public',
        redistribution: 'free',
      },
      style_family: 'chunky-low-poly',
      provenance: {},
    },
    ...overrides,
  } as ResolvedCard;
}

const LOCK: AssetsLock = { version: 1, family: 'chunky-low-poly', pov: 'iso', assets: [] };

function entry(overrides: Partial<LockEntry> = {}): LockEntry {
  return {
    id: 't1:fixture/orc@1',
    sha256: '0'.repeat(64),
    path: 'assets/model/fixture/orc.glb',
    license: 'CC0-1.0',
    rights: {
      uses: ['in-game', 'placeholder'],
      audience: 'public',
      redistribution: 'free',
      attribution: null,
    },
    added: '2026-11-01',
    ...overrides,
  };
}

describe('asset refusal rules', () => {
  it('allows in-game rights and gates placeholder-only cards behind --placeholder', () => {
    expect(refusalsForUse(card(), LOCK, { placeholder: false })).toEqual([]);
    const placeholder = card({
      resolved: {
        ...card().resolved,
        rights: { uses: ['placeholder'], audience: 'public', redistribution: 'free' },
      },
    });
    expect(refusalsForUse(placeholder, LOCK, { placeholder: false }).map((item) => item.rule)).toEqual([
      'needs-in-game',
    ]);
    expect(refusalsForUse(placeholder, LOCK, { placeholder: true })).toEqual([]);
  });

  it('always rejects redistribution none and rejected cards', () => {
    const restricted = card({
      status: 'rejected',
      resolved: {
        ...card().resolved,
        rights: { uses: ['in-game'], audience: 'private', redistribution: 'none' },
      },
    });
    expect(refusalsForUse(restricted, LOCK, { placeholder: false }).map((item) => item.rule)).toEqual([
      'no-redistribution',
      'rejected',
    ]);
  });

  it('requires an explicit exception for an out-of-family card', () => {
    const mismatched = card({ resolved: { ...card().resolved, style_family: 'pixel-art' } });
    expect(refusalsForUse(mismatched, LOCK, { placeholder: false }).map((item) => item.rule)).toEqual([
      'family-mismatch',
    ]);
    expect(refusalsForUse(mismatched, LOCK, { placeholder: false, exception: 'intentional contrast' })).toEqual([]);
  });

  it('checks stale rights, file integrity, and public publication rights independently', () => {
    const current = card({
      resolved: {
        ...card().resolved,
        rights: { uses: ['in-game'], audience: 'private', redistribution: 'in-build' },
      },
    });
    expect(
      refusalsForCheck(entry({
        rights: {
          uses: ['placeholder'],
          audience: 'private',
          redistribution: 'in-build',
          attribution: null,
        },
      }), current, { exists: true, sha256: '1'.repeat(64) }, {
        publish: true,
        visibility: 'public',
        currentRights: {
          uses: ['in-game'],
          audience: 'private',
          redistribution: 'in-build',
          attribution: null,
        },
      }).map((item) => item.rule),
    ).toEqual(['sha-mismatch', 'stale-rights', 'placeholder-only', 'private-in-public']);
  });

  it('intersects derived rights without widening any source', () => {
    expect(
      intersectLockRights([
        { uses: ['in-game', 'placeholder'], audience: 'public', redistribution: 'free', attribution: 'Kenney' },
        { uses: ['in-game'], audience: 'private', redistribution: 'in-build', attribution: 'Synty' },
      ]),
    ).toEqual({
      uses: ['in-game'],
      audience: 'private',
      redistribution: 'in-build',
      attribution: 'Kenney; Synty',
    });
  });
});
