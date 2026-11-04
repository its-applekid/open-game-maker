import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StudioMenu } from './StudioMenu';

const state = vi.hoisted(() => ({
  admin: { data: undefined as { platformRole: 'maintainer' | 'admin' | 'none' } | undefined },
  jobs: { jobs: [] as TestJob[], active: [] as TestJob[], games: [] as Array<{ id: string; title: string }> },
  session: { data: null as { user: { id: string } } | null },
}));

const sound = vi.hoisted(() => ({
  getVolume: vi.fn(() => 0.75),
  onChange: vi.fn(() => () => undefined),
  setMuted: vi.fn(),
  setVolume: vi.fn(),
  status: vi.fn(() => 'on' as const),
}));

vi.mock('../features/build-chat/jobs', () => ({
  isTerminal: (value: string) => ['done', 'failed', 'cancelled'].includes(value),
  useMyJobs: () => state.jobs,
}));
vi.mock('../lib/api/session', () => ({ useSession: () => state.session }));
vi.mock('../lib/api/auth', () => ({ signOut: vi.fn() }));
vi.mock('../lib/sound', () => sound);
vi.mock('../routes/admin/api', () => ({ useAdminMe: () => state.admin }));

type TestJob = {
  id: string;
  gameId: string;
  branchId: string;
  state: 'running' | 'done';
  stage?: 'building' | 'done';
  stageText?: string;
  progressPercent?: number;
  updatedAt: string;
  terminalAt: string | null;
};

const runningJob = (overrides: Partial<TestJob> = {}): TestJob => ({
  id: 'job-1',
  gameId: 'game-1',
  branchId: 'main',
  state: 'running',
  stage: 'building',
  stageText: 'Building rooms',
  progressPercent: 42,
  updatedAt: new Date().toISOString(),
  terminalAt: null,
  ...overrides,
});

afterEach(() => {
  cleanup();
  state.admin = { data: undefined };
  state.jobs = { jobs: [], active: [], games: [] };
  state.session = { data: null };
  sound.setMuted.mockReset();
  sound.setVolume.mockReset();
});

describe('StudioMenu', () => {
  it('opens the always-available controls on the title without signed-in links', () => {
    renderMenu('/');

    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));

    expect(screen.getByRole('slider', { name: 'Volume' })).toHaveValue('0.75');
    expect(screen.getByRole('button', { name: 'Mute' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Report a problem' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Credits' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Versions' })).not.toBeInTheDocument();
  });

  it('shows signed-in and game actions only in their relevant context', () => {
    state.session = { data: { user: { id: 'user-1' } } };
    state.admin = { data: { platformRole: 'maintainer' } };

    const view = renderMenu('/games');
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));

    expect(screen.getByRole('link', { name: 'Credits' })).toHaveAttribute('href', '/settings/credits');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin');
    expect(screen.queryByRole('link', { name: 'Versions' })).not.toBeInTheDocument();

    view.unmount();
    renderMenu('/g/game-1?mode=edit');
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));

    expect(screen.getByRole('link', { name: 'Versions' })).toHaveAttribute('href', '/g/game-1/versions');
    expect(screen.getByRole('link', { name: 'Publish' })).toHaveAttribute('href', '/g/game-1/releases?action=publish');
    expect(screen.getByRole('link', { name: 'Rollback' })).toHaveAttribute(
      'href',
      '/g/game-1/releases?action=rollback',
    );
  });

  it('moves build progress to the menu and announces each start and end once', () => {
    const job = runningJob();
    state.session = { data: { user: { id: 'user-1' } } };
    state.jobs = { jobs: [job], active: [job], games: [{ id: 'game-1', title: 'Moon Vault' }] };

    const view = renderMenu('/games');
    const trigger = screen.getByRole('button', { name: 'Menu' });
    expect(trigger).toHaveAttribute('data-building', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Building Moon Vault');

    fireEvent.click(trigger);
    const build = screen.getByRole('link', { name: /Moon Vault.*Building rooms.*42%/ });
    expect(build).toHaveAttribute('href', '/g/game-1?v=main');

    const finished = runningJob({
      state: 'done',
      stage: 'done',
      stageText: 'Ready to try',
      progressPercent: 100,
      terminalAt: new Date().toISOString(),
    });
    state.jobs = { jobs: [finished], active: [], games: [{ id: 'game-1', title: 'Moon Vault' }] };
    view.rerender(
      <MemoryRouter initialEntries={['/games']}>
        <StudioMenu />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: 'Menu' })).toHaveAttribute('data-building', 'false');
    expect(screen.getByRole('status')).toHaveTextContent('Finished building Moon Vault');
  });

  it('closes on Escape and returns focus to the hamburger', () => {
    renderMenu('/games');
    const trigger = screen.getByRole('button', { name: 'Menu' });
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Menu' })).toBeVisible();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

function renderMenu(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <StudioMenu />
    </MemoryRouter>,
  );
}
