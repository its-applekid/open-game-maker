import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { normaliseMessage, signature, signatureText, textSignature } from '../src/reports/signature.js';
import { crash, ids } from './reports-helpers.js';

describe('report signature', () => {
  it.each([
    ['digits', 'failed at tick 4312 of 99', 'failed at tick # of #'],
    ['hex ids', 'missing sprite 3fa9c0d1e2 in atlas', 'missing sprite # in atlas'],
    ['short hex stays text', 'bad face cafe', 'bad face cafe'],
    ['case', 'TypeError In Combat', 'typeerror in combat'],
    ['whitespace', '  a\n\tb   c ', 'a b c'],
  ])('normalises %s', (_name, input, expected) => {
    expect(normaliseMessage(input)).toBe(expected);
  });

  it('matches the worked example: type, message, in-game file:fn, game id', () => {
    const report = crash();
    expect(signatureText({ error: report.error, gameId: ids.game, scope: 'game' })).toBe(
      `typeerror|cannot read properties of undefined (reading 'hp') at tick #|systems/combat.js:applydamage|${ids.game}`,
    );
    expect(signature({ error: report.error, gameId: ids.game, scope: 'game' })).toBe(
      createHash('sha256')
        .update(
          `typeerror|cannot read properties of undefined (reading 'hp') at tick #|systems/combat.js:applydamage|${ids.game}`,
        )
        .digest('hex'),
    );
  });

  it('treats the same bug with different numbers, ids and builds as one signature', () => {
    const a = crash();
    const b = crash(ids.game, `https://games.example.test/g/${ids.game}/b_99999999/systems/combat.js`);
    b.error.message = "Cannot read properties of undefined (reading 'hp') at tick 7";
    expect(signature({ error: a.error, gameId: ids.game, scope: 'game' })).toBe(
      signature({ error: b.error, gameId: ids.game, scope: 'game' }),
    );
  });

  it('keeps game signatures per game and merges platform signatures across games', () => {
    const a = crash(ids.game);
    const b = crash(ids.otherGame);
    expect(signature({ error: a.error, gameId: ids.game, scope: 'game' })).not.toBe(
      signature({ error: b.error, gameId: ids.otherGame, scope: 'game' }),
    );
    expect(signature({ error: a.error, gameId: ids.game, scope: 'platform' })).toBe(
      signature({ error: b.error, gameId: ids.otherGame, scope: 'platform' }),
    );
  });

  it('groups no-error reports by game, release and normalised text only', () => {
    const base = { gameId: ids.game, releaseId: ids.release, text: 'Jumping feels   WRONG' };
    expect(textSignature(base)).toBe(textSignature({ ...base, text: 'jumping feels wrong' }));
    expect(textSignature(base)).not.toBe(textSignature({ ...base, gameId: ids.otherGame }));
    expect(textSignature(base)).not.toBe(textSignature({ ...base, releaseId: undefined }));
    expect(textSignature(base)).toMatch(/^[0-9a-f]{64}$/);
  });
});
