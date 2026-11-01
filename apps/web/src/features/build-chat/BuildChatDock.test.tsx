import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BuildChatDock } from './BuildChatDock';
import { useDock } from './dock';
import { buildChatJob } from './test-fixtures';

const jobState = vi.hoisted(() => ({ jobs: [] as unknown[] }));
const chatListeners = vi.hoisted(() => new Map<string, (message: Record<string, unknown>, sequence: number) => void>());

vi.mock('./jobs', () => ({
  cancelJob: vi.fn(),
  useBudgetUnitLabel: () => 'coins',
  useMyJobs: () => ({ jobs: jobState.jobs }),
}));

vi.mock('./stream', async (importOriginal) => {
  const original = await importOriginal<typeof import('./stream')>();
  return {
    ...original,
    subscribeChat: vi.fn(
      (jobId: string, _since: number, listener: (message: Record<string, unknown>, sequence: number) => void) => {
        chatListeners.set(jobId, listener);
        return () => chatListeners.delete(jobId);
      },
    ),
  };
});

beforeEach(() => {
  useDock.getState().reset();
  chatListeners.clear();
});

afterEach(() => cleanup());

describe('BuildChatDock', () => {
  it('remounts chat state when switching jobs', async () => {
    const first = buildChatJob({ id: 'j_first' });
    const second = buildChatJob({ id: 'j_second', plan: { ...first.plan, title: 'Second build' } });
    jobState.jobs = [first, second];
    render(
      <MemoryRouter>
        <BuildChatDock />
      </MemoryRouter>,
    );

    act(() => useDock.getState().openChat(first.id, [first, second]));
    await waitFor(() => expect(chatListeners.has(first.id)).toBe(true));
    act(() =>
      chatListeners.get(first.id)?.(
        {
          id: 'm_old',
          job_id: first.id,
          at: '2026-11-01T09:00:00Z',
          actor: 'agent',
          kind: 'text',
          text: 'Old job message',
        },
        1,
      ),
    );
    expect(screen.getByText('Old job message')).toBeInTheDocument();

    act(() => useDock.getState().openChat(second.id, [first, second]));

    expect(screen.queryByText('Old job message')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Second build' })).toBeInTheDocument();
  });
});
