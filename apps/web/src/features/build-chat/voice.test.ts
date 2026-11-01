import { afterEach, describe, expect, it, vi } from 'vitest';

import { probeVoice, type BuildVoiceTarget } from './voice';

const target: BuildVoiceTarget = {
  kind: 'build',
  game_id: 'g_1',
  job_id: 'j_1',
  ticket: '57',
  creator_id: 'u_1',
};

afterEach(() => vi.unstubAllGlobals());

describe('probeVoice', () => {
  it('treats a 503 token probe as unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
    await expect(probeVoice(target)).resolves.toEqual({ available: false });
  });
});
