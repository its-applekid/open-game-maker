import { readFileSync } from 'node:fs';

import { AgreedScope, ScopeChoices } from '../src/scope.js';
import { describe, expect, it } from 'vitest';

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`../fixtures/scope/${name}.json`, import.meta.url), 'utf8'));
}

describe('scope contracts', () => {
  it('accepts the worked choices and agreed scope fixtures', () => {
    expect(ScopeChoices.parse(fixture('choices'))).toMatchObject({ players: 'single' });
    expect(AgreedScope.parse(fixture('agreed'))).toMatchObject({
      title: 'Fox Workshop',
      tickets: [{ key: 'T1', title: 'Build the workshop loop' }],
    });
  });

  it('rejects an unsupported player mode and an incomplete ticket', () => {
    const choices = fixture('choices') as Record<string, unknown>;
    expect(ScopeChoices.safeParse({ ...choices, players: 'coop' }).success).toBe(false);
    const agreed = fixture('agreed') as { tickets: Array<Record<string, unknown>> };
    const [{ title: _title, ...missingTitle }] = agreed.tickets;
    expect(AgreedScope.safeParse({ ...agreed, tickets: [missingTitle] }).success).toBe(false);
  });
});
