import { describe, expect, it } from 'vitest';

import { validateCard, validateLayoutSpec } from '../src/card.js';
import { cardFixtureDocs, negativeFixture } from './helpers.js';

describe('card schemas', () => {
  it('accepts all 16 moved C3 fixtures', () => {
    for (const { file, doc } of cardFixtureDocs()) {
      const schema = (doc as { schema?: string }).schema;
      const result = schema?.startsWith('ogm.map-layout-spec') ? validateLayoutSpec(doc) : validateCard(doc);
      expect(result, file).toMatchObject({ ok: true });
    }
  });

  it('accepts 1.1 processing and rejects unknown processing modes', () => {
    const card = structuredClone(
      cardFixtureDocs().find(({ file }) => file === 'collection-kenney-mini-dungeon.json')?.doc,
    );
    expect(validateCard(card)).toMatchObject({ ok: true });

    (card as { rights: { processing: string } }).rights.processing = 'cloud';
    const result = validateCard(card);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join('\n')).toContain('processing');
  });

  it('reports the invalid interpretation author', () => {
    const result = validateCard(negativeFixture('interpretation-not-admin.json').doc);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join('\n')).toContain('set_by');
  });

  it('accepts the deterministic conversion flag used by asset intake', () => {
    const card = structuredClone(
      cardFixtureDocs().find(({ file }) => file === 'asset-wall.json')?.doc ??
        cardFixtureDocs().find(({ doc }) => (doc as { card_type?: string }).card_type === 'asset')?.doc,
    ) as Record<string, unknown>;
    card.flags = ['needs-conversion'];
    expect(validateCard(card)).toMatchObject({ ok: true });
  });
});
