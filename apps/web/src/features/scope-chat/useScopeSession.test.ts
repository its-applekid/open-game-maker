import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { AgreedScope, ScopeChoices } from '@ogm/contracts';

import { ApiError } from '../../lib/api/client';
import { useScopeSession } from './useScopeSession';
import type { ScopeTransport } from './transport';

const choices: ScopeChoices = {
  genre: 'Adventure',
  vibe: 'Cozy',
  family: 'smallscaleint',
  world: 'Sky islands',
  players: 'single',
  pov: 'iso',
};

const scope: AgreedScope = {
  session_id: 's_1',
  title: 'Midnight Crumbs',
  summary: 'Deliver bread between floating islands.',
  scope: { included: ['three islands'], excluded: [] },
  tickets: [
    {
      key: 'game',
      title: 'Build the game',
      skills: [],
      dependsOn: [],
      acceptanceCriteria: ['A delivery is playable.'],
    },
  ],
  complexity: 2,
  open_questions: [],
  ideas: [],
};

function fakeTransport(): ScopeTransport {
  return {
    createSession: vi.fn().mockResolvedValue({ sessionId: 's_1', jobId: 'j_1' }),
    getSession: vi.fn().mockResolvedValue({ sessionId: 's_1', chatJobId: 'j_1', status: 'agreed', scope }),
    postText: vi.fn().mockResolvedValue({
      id: 'm_2',
      job_id: 'j_1',
      at: '2026-11-02T07:00:00.000Z',
      actor: 'creator',
      kind: 'text',
      text: 'keep it small',
    }),
    subscribe: vi.fn((_jobId, onMessage) => {
      onMessage({
        id: 'm_1',
        job_id: 'j_1',
        at: '2026-11-02T06:59:00.000Z',
        actor: 'agent',
        kind: 'text',
        text: 'Three islands is a good first version.',
      });
      return () => undefined;
    }),
  };
}

describe('useScopeSession', () => {
  it('streams builder replies and exposes the agreed plan', async () => {
    const transport = fakeTransport();
    const { result } = renderHook(() => useScopeSession('g_1', choices, transport));

    await waitFor(() => expect(result.current.status).toBe('agreed'));
    expect(result.current.sessionId).toBe('s_1');
    expect(result.current.jobId).toBe('j_1');
    expect(result.current.scope).toEqual(scope);
    expect(result.current.turns).toContainEqual({ id: 'm_1', who: 'builder', text: 'Three islands is a good first version.' });
  });

  it('posts creator text through the scope job chat', async () => {
    const transport = fakeTransport();
    const { result } = renderHook(() => useScopeSession('g_1', choices, transport));
    await waitFor(() => expect(result.current.jobId).toBe('j_1'));

    await act(async () => result.current.send('keep it small'));

    expect(transport.postText).toHaveBeenCalledWith('j_1', 'keep it small');
    expect(result.current.turns).toContainEqual({ id: 'm_2', who: 'you', text: 'keep it small' });
  });

  it('reports a missing scope route without enabling admission', async () => {
    const transport = fakeTransport();
    vi.mocked(transport.getSession).mockRejectedValue(new ApiError(404, { error: 'not_found' }));
    const { result } = renderHook(() => useScopeSession('g_1', choices, transport));

    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(result.current.scope).toBeUndefined();
    expect(result.current.error).toContain('unavailable');
  });
});
