import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  authClient: { linkSocial: vi.fn() },
  authErrorMessage: (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback),
  getGitHubStatus: vi.fn(),
  getRepoVisibilityDefault: vi.fn(),
  isAgeRequiredError: vi.fn(() => false),
  requireAge: vi.fn(),
  safeNext: (value: string | null, fallback: string) => value ?? fallback,
  setRepoVisibilityDefault: vi.fn(),
}));

vi.mock('../../lib/api/auth', () => auth);

import { ConnectGitHubScreen } from './ConnectGitHubScreen';

function renderConnect(entry = '/connect/github') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/connect/github" element={<ConnectGitHubScreen />} />
        <Route path="/games" element={<h1>Games destination</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  auth.authClient.linkSocial.mockResolvedValue({ data: {}, error: null });
  auth.getGitHubStatus.mockResolvedValue({ connected: false });
  auth.getRepoVisibilityDefault.mockReturnValue('private');
  auth.requireAge.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ConnectGitHubScreen', () => {
  it('starts the GitHub link flow', async () => {
    renderConnect('/connect/github?next=%2Fgames');

    fireEvent.click(await screen.findByRole('button', { name: 'Connect GitHub' }));

    expect(auth.authClient.linkSocial).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'github', callbackURL: expect.stringContaining('/connect/github?') }),
    );
  });

  it('renders the connected login and persists the visibility choice', async () => {
    auth.getGitHubStatus.mockResolvedValue({ connected: true, login: 'octocat' });
    renderConnect();

    expect(await screen.findByText('@octocat')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Public' }));

    expect(auth.setRepoVisibilityDefault).toHaveBeenCalledWith('public');
    expect(screen.getByRole('button', { name: 'Public' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps visibility tiles to a bare label like the prototype option tiles', async () => {
    auth.getGitHubStatus.mockResolvedValue({ connected: true, login: 'octocat' });
    renderConnect();

    await screen.findByText('@octocat');
    expect(screen.getByRole('button', { name: 'Public' })).toHaveTextContent(/^Public$/);
    expect(screen.getByRole('button', { name: 'Private' })).toHaveTextContent(/^Private$/);
  });

  it('continues to next after GitHub is connected', async () => {
    auth.getGitHubStatus.mockResolvedValue({ connected: true, login: 'octocat' });
    renderConnect('/connect/github?next=%2Fgames');

    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Games destination' })).toBeVisible());
  });

  it('offers a retry when account status cannot be loaded', async () => {
    auth.getGitHubStatus.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ connected: false });
    renderConnect();

    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(auth.getGitHubStatus).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('button', { name: 'Connect GitHub' })).toBeVisible();
  });

  it('shows a failed GitHub link and permits a retry', async () => {
    auth.authClient.linkSocial.mockRejectedValueOnce(new Error('GitHub is unavailable.'));
    renderConnect();

    fireEvent.click(await screen.findByRole('button', { name: 'Connect GitHub' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('GitHub is unavailable.');
    expect(screen.getByRole('button', { name: 'Connect GitHub' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Connect GitHub' }));
    await waitFor(() => expect(auth.authClient.linkSocial).toHaveBeenCalledTimes(2));
  });
});
