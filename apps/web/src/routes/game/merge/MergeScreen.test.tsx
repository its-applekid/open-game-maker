import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MergePlan } from '@ogm/contracts/browser';

import { useDock } from '../../../features/build-chat/dock';

const editor = vi.hoisted(() => ({
  acquireLease: vi.fn(),
  getDesignSnapshot: vi.fn(),
  listJobs: vi.fn(),
  releaseLease: vi.fn(),
}));

vi.mock('../../../features/editor/api', () => editor);
vi.mock('./SideBySide', () => ({
  displayValue: (value: unknown) => String(value),
  SideBySide: ({ mineValue, theirsValue }: { mineValue: unknown; theirsValue: unknown }) => (
    <div>
      Mine {String(mineValue)} Theirs {String(theirsValue)}
    </div>
  ),
  FramePreview: () => <div>Preview frame</div>,
}));

import { MergeScreen } from './MergeScreen';

let plan: MergePlan;

beforeEach(() => {
  useDock.getState().reset();
  plan = {
    id: 'plan_one',
    gameId: 'game',
    sourceBranchId: 'source',
    targetBranchId: 'target',
    baseRev: 2,
    auto: [],
    conflicts: [
      {
        id: 'conflict_one',
        path: '/entities/door/props/locked',
        entityId: 'door',
        controlId: 'locked',
        kind: 'both_changed',
        ours: { path: '/locked', before: false, after: false, txId: 'ours' },
        theirs: { path: '/locked', before: false, after: true, txId: 'theirs' },
      },
    ],
    code: 'clean',
    status: 'resolving',
  };
  editor.getDesignSnapshot.mockImplementation((_gameId: string, branchId: string) =>
    Promise.resolve({
      buildId: `${branchId}_build`,
      rev: 2,
      doc: { schemaVersion: 1, globals: {}, entities: {} },
    }),
  );
  editor.listJobs.mockResolvedValue({ jobs: [] });
  editor.acquireLease.mockResolvedValue({ ok: true, lease: { token: 8, expiresAt: '2026-11-02T12:00:00.000Z' } });
  editor.releaseLease.mockResolvedValue({ ok: true, lease: { token: 8, expiresAt: '2026-11-02T12:00:00.000Z' } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('MergeScreen', () => {
  it('resolves all mine, previews, and lands through a released target lease', async () => {
    const fetchMock = stubMergeApi();
    renderMerge();

    expect(await screen.findByText(/Mine false Theirs true/)).toBeVisible();
    expect(editor.listJobs).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Both' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Land' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Keep all of mine' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Preview' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Land' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Land' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/g/game?v=target'));
    expect(editor.acquireLease).toHaveBeenCalledWith('game', 'target', expect.any(String));
    expect(editor.releaseLease).toHaveBeenCalledWith('game', 'target', expect.any(String), 8);
    expect(fetchMock.mock.calls.find(([path]) => path.toString().endsWith('/resolve-all'))?.[1]).toEqual(
      expect.objectContaining({ body: JSON.stringify({ resolution: 'ours' }) }),
    );
    expect(fetchMock.mock.calls.find(([path]) => path.toString().endsWith('/land'))?.[1]).toEqual(
      expect.objectContaining({ method: 'POST', body: expect.stringContaining('"token":8') }),
    );
  }, 15_000);

  it('opens a code-conflict job and keeps Land disabled', async () => {
    plan = { ...plan, code: { conflictJobId: 'job_conflict' } };
    editor.listJobs.mockResolvedValue({ jobs: [{ id: 'job_conflict', state: 'running' }] });
    stubMergeApi();
    renderMerge();

    const open = await screen.findByRole('button', { name: 'Open conflict build' });
    await waitFor(() => expect(open).toBeEnabled());
    expect(screen.getByRole('button', { name: 'Land' })).toBeDisabled();
    fireEvent.click(open);

    expect(useDock.getState()).toMatchObject({ view: 'chat', openJobId: 'job_conflict' });
  }, 10_000);

  it('retries a failed code-job lookup before opening conflict chat', async () => {
    plan = { ...plan, code: { conflictJobId: 'job_conflict' } };
    editor.listJobs
      .mockRejectedValueOnce(new Error('jobs unavailable'))
      .mockResolvedValue({ jobs: [{ id: 'job_conflict', state: 'running' }] });
    stubMergeApi();
    renderMerge();

    expect(await screen.findByText('Conflict build unavailable.')).toBeVisible();
    const open = screen.getByRole('button', { name: 'Open conflict build' });
    expect(open).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(open).toBeEnabled());
  });

  it('shows and retries a failed branch comparison', async () => {
    let targetAttempts = 0;
    editor.getDesignSnapshot.mockImplementation((_gameId: string, branchId: string) => {
      if (branchId === 'target' && targetAttempts++ === 0) return Promise.reject(new Error('snapshot unavailable'));
      return Promise.resolve({
        buildId: `${branchId}_build`,
        rev: 2,
        doc: { schemaVersion: 1, globals: {}, entities: {} },
      });
    });
    stubMergeApi();
    renderMerge();

    expect(await screen.findByText('Comparison unavailable.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText(/Mine false Theirs true/)).toBeVisible();
  });

  it('submits abandon only once while the request is pending', async () => {
    let resolveAbandon!: (response: Response) => void;
    const abandonResponse = new Promise<Response>((resolve) => {
      resolveAbandon = resolve;
    });
    const fetchMock = stubMergeApi(200, abandonResponse);
    renderMerge();

    fireEvent.click(await screen.findByRole('button', { name: 'Abandon' }));
    const confirm = screen.getByRole('button', { name: 'Abandon merge' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(screen.getByRole('button', { name: 'Abandoning…' })).toBeDisabled();
    expect(fetchMock.mock.calls.filter(([path]) => path.toString().endsWith('/abandon'))).toHaveLength(1);

    await act(async () => resolveAbandon(json({ ...plan, status: 'abandoned' })));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/g/game/versions?v=target'));
  });

  it('shows target movement, releases the lease, and stays on the merge', async () => {
    plan = {
      ...plan,
      status: 'previewing',
      previewBuildId: 'preview_build',
      conflicts: plan.conflicts.map((conflict) => ({ ...conflict, resolution: 'ours' })),
    };
    stubMergeApi(409);
    renderMerge();

    const land = await screen.findByRole('button', { name: 'Land' });
    await waitFor(() => expect(land).toBeEnabled());
    fireEvent.click(land);

    expect(await screen.findByRole('alert')).toHaveTextContent('target_moved');
    expect(screen.getByTestId('location')).toHaveTextContent('/g/game/merge/plan_one?target=target');
    expect(editor.releaseLease).toHaveBeenCalledWith('game', 'target', expect.any(String), 8);
  }, 10_000);
});

function renderMerge() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/g/game/merge/plan_one?target=target']}>
        <Location />
        <Routes>
          <Route path="/g/:gameId/merge/:planId" element={<MergeScreen />} />
          <Route path="/g/:gameId" element={<p>Game</p>} />
          <Route path="/g/:gameId/versions" element={<p>Versions</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function Location() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function stubMergeApi(landStatus = 200, abandonResponse?: Promise<Response>) {
  const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const path = input.toString();
    if (path.endsWith('/resolve-all')) {
      plan = { ...plan, conflicts: plan.conflicts.map((conflict) => ({ ...conflict, resolution: 'ours' })) };
      return Promise.resolve(json(plan));
    }
    if (path.endsWith('/preview')) {
      plan = { ...plan, status: 'previewing', previewBuildId: 'preview_build' };
      return Promise.resolve(
        json({
          previewBuildId: 'preview_build',
          rev: 3,
          doc: { schemaVersion: 1, globals: {}, entities: {} },
        }),
      );
    }
    if (path.endsWith('/land') && init?.method === 'POST') {
      return Promise.resolve(landStatus === 200 ? json({ rev: 4 }) : json({ error: 'target_moved' }, landStatus));
    }
    if (path.endsWith('/abandon') && init?.method === 'POST') {
      return abandonResponse ?? Promise.resolve(json({ ...plan, status: 'abandoned' }));
    }
    if (path.endsWith('/plan_one')) return Promise.resolve(json(plan));
    return Promise.resolve(json({ error: 'not_found' }, 404));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
