import { describe, expect, it } from 'vitest';

import type { AssetCard } from '../src/card.js';
import {
  RightsError,
  defaultProcessing,
  effectiveRights,
  processingAllowed,
  rightsAgree,
  type RightsBasis,
} from '../src/rights.js';
import { cardFixtureDocs, negativeFixture } from './helpers.js';

function collection(name: string): AssetCard {
  return cardFixtureDocs().find(({ file }) => file === name)?.doc as AssetCard;
}

describe('effective rights', () => {
  it('reproduces the confirmed Kenney ceiling', () => {
    const card = collection('collection-kenney-mini-dungeon.json');
    const effective = effectiveRights(card.rights!.basis);
    expect([...effective.uses]).toEqual(['in-game', 'placeholder', 'derive-layout', 'style-reference', 'vision-input']);
    expect(effective).toMatchObject({ audience: 'public', redistribution: 'free' });
    expect(rightsAgree(card.rights!, effective)).toBe(true);
  });

  it('uses the default ceiling while unconfirmed licence prohibitions still bind', () => {
    const basis = (negativeFixture('interpretation-adds-forbidden-use.json').doc as AssetCard).rights!.basis;
    expect(() => effectiveRights(basis)).toThrowError(
      new RightsError('interpretation adds forbidden use(s) vision-input'),
    );
  });

  it('lets decisions narrow but never widen a ceiling', () => {
    const basis: RightsBasis[] = [
      {
        type: 'license',
        uses: ['in-game', 'placeholder'],
        audience: 'private',
        redistribution: 'in-build',
        set_by: { role: 'intake-code' },
        confirmed_by: 'kevin',
        date: '2026-10-26',
      },
      {
        type: 'decision',
        uses: ['in-game'],
        audience: 'public',
        redistribution: 'free',
        set_by: { role: 'admin' },
        date: '2026-10-27',
      },
    ];

    expect(effectiveRights(basis)).toEqual({
      uses: new Set(['in-game']),
      audience: 'private',
      redistribution: 'in-build',
    });
  });
});

describe('processing policy', () => {
  it('defaults vendor, unknown, and quarantined assets to local processing', () => {
    expect(defaultProcessing('LicenseRef-synty-personal', 'tagged')).toBe('local-only');
    expect(defaultProcessing('CC0-1.0', 'tagged')).toBe('any');
    expect(defaultProcessing('CC0-1.0', 'quarantined')).toBe('local-only');
    expect(defaultProcessing(undefined, 'draft')).toBe('local-only');
  });

  it('refuses explicit cloud processing for vendor licences', () => {
    const card = negativeFixture('processing-any-on-vendor-license.json').doc as AssetCard;
    expect(processingAllowed(card)).toEqual({
      ok: false,
      reason: 'processing any requires an SPDX licence and non-quarantined status',
    });
  });
});
