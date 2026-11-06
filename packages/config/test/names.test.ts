import { describe, expect, it } from 'vitest';

import { OGM_ENV_NAMES, OGM_ENV_UNITS } from '../src/names.js';

describe('OGM_ENV_NAMES', () => {
  it('contains unique uppercase names with documentation', () => {
    const names = OGM_ENV_NAMES.map(({ name }) => name);

    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(names.map((name) => name.toUpperCase()));
    expect(names.every((name) => /^[A-Z][A-Z0-9_]*$/.test(name))).toBe(true);
    expect(OGM_ENV_NAMES.every(({ doc }) => doc.trim().length > 0)).toBe(true);
  });

  it('lists every initializable unit independently of row ownership', () => {
    expect(OGM_ENV_UNITS).toEqual([
      'api',
      'rooms',
      'games',
      'commit',
      'voice-host',
      'repair',
      'intake',
      'drive-sync',
      'aiur',
      'backup',
      'gm',
      'web',
      'core-bump',
    ]);
  });

  it('keeps live ElevenLabs credentials and cleanup state in the voice-host unit', () => {
    expect(
      OGM_ENV_NAMES.filter(({ name }) => name.startsWith('ELEVENLABS_') || name === 'OGM_VOICE_CLEANUP_ROOT'),
    ).toEqual([
      {
        name: 'ELEVENLABS_API_KEY',
        unit: 'voice-host',
        kind: 'secret',
        doc: 'ElevenLabs API key for live dictation, conversations and narration',
      },
      {
        name: 'ELEVENLABS_AGENT_ID',
        unit: 'voice-host',
        kind: 'string',
        doc: 'ElevenLabs hosted conversational-agent id',
      },
      {
        name: 'OGM_VOICE_CLEANUP_ROOT',
        unit: 'voice-host',
        kind: 'path',
        doc: 'durable provider-conversation cleanup queue',
      },
    ]);
  });
});
