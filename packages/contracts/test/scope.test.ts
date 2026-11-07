import { readFileSync } from 'node:fs';

import {
  AgreedScope,
  AudioDirection,
  ScopeChoices,
  ScopeRevisionRequest,
  ScopeSession,
  audioDirectionText,
  hasAudioDirection,
} from '../src/scope.js';
import { describe, expect, it } from 'vitest';

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`../fixtures/scope/${name}.json`, import.meta.url), 'utf8'));
}

describe('scope contracts', () => {
  it('accepts the worked choices and agreed scope fixtures', () => {
    expect(ScopeChoices.parse(fixture('choices'))).toMatchObject({
      players: 'single',
      audio: { style: 'chiptune', mood: 'playful' },
    });
    expect(AgreedScope.parse(fixture('agreed'))).toMatchObject({
      revision: 1,
      title: 'Fox Workshop',
      tickets: [{ key: 'T1', title: 'Build the workshop loop' }],
    });
    expect(
      ScopeSession.parse({
        id: 's_88000000-0000-4000-8000-000000000001',
        game_id: 'g_88000000-0000-4000-8000-000000000001',
        creator_id: 'u_88000000-0000-4000-8000-000000000001',
        job_id: 'j_88000000-0000-4000-8000-000000000001',
        status: 'revising',
        revision: 1,
        choices: fixture('choices'),
        scope: fixture('agreed'),
        at: '2026-11-01T18:00:00.000Z',
      }),
    ).toMatchObject({ status: 'revising', revision: 1 });
    expect(ScopeRevisionRequest.parse({ expectedRevision: 1 })).toEqual({ expectedRevision: 1 });
  });

  it('rejects an unsupported player mode and an incomplete ticket', () => {
    const choices = fixture('choices') as Record<string, unknown>;
    expect(ScopeChoices.safeParse({ ...choices, players: 'coop' }).success).toBe(false);
    const agreed = fixture('agreed') as { tickets: Array<Record<string, unknown>> };
    const [{ title: _title, ...missingTitle }] = agreed.tickets;
    expect(AgreedScope.safeParse({ ...agreed, tickets: [missingTitle] }).success).toBe(false);
    expect(AgreedScope.safeParse({ ...agreed, revision: 0 }).success).toBe(false);
    const { revision: _revision, ...legacyAgreement } = agreed as Record<string, unknown>;
    expect(AgreedScope.parse(legacyAgreement).revision).toBe(1);
    expect(ScopeRevisionRequest.safeParse({ expectedRevision: 0 }).success).toBe(false);
  });

  it('reads the audio direction as a direction, not pack ids, and refuses an empty one', () => {
    expect(AudioDirection.parse({ style: 'orchestral' })).toEqual({ style: 'orchestral' });
    expect(AudioDirection.parse({ mood: 'tense' })).toEqual({ mood: 'tense' });
    expect(AudioDirection.parse({ other: 'drums made of rain' })).toEqual({ other: 'drums made of rain' });
    expect(AudioDirection.safeParse({ style: 'orchestral', packs: ['pixabay'] }).success).toBe(false);
    expect(hasAudioDirection(AudioDirection.parse({ style: 'chiptune', mood: 'playful' }))).toBe(true);
    expect(hasAudioDirection(AudioDirection.parse({}))).toBe(false);
    expect(hasAudioDirection(undefined)).toBe(false);
    expect(audioDirectionText({ style: 'chiptune', mood: 'playful' })).toBe('chiptune, playful');
    expect(audioDirectionText({ other: 'drums made of rain' })).toBe('drums made of rain');
  });
});
