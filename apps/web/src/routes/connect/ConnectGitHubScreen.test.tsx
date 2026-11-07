import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  authErrorMessage: (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback),
  connectGitHubInstallation: vi.fn(),
  getGitHubStatus: vi.fn(),
  getRepoVisibilityDefault: vi.fn(),
  gitHubInstallUrl: vi.fn(),
  readGitHubInstallState: vi.fn(),
  safeNext: (value: string | null, fallback: string) => value ?? fallback,
  setRepoVisibilityDefault: vi.fn(),
}));
const assign = vi.fn();

vi.mock('../../lib/api/auth', () => auth);

import { ConnectGitHubScreen } from './ConnectGitHubScreen';

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function renderConnect(entry = '/connect/github') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route
          path="/connect/github"
          element={
            <>
              <ConnectGitHubScreen />
              <LocationProbe />
            </>
          }
        />
        <Route path="/all" element={<h1>Games destination</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.stubGlobal('location', { ...window.location, assign });
  auth.gitHubInstallUrl.mockImplementation(
    (next: string) => `https://github.com/apps/ogm/installations/new?state=${encodeURIComponent(next)}`,
  );
  auth.connectGitHubInstallation.mockResolvedValue({ connected: true, login: 'octocat' });
  auth.readGitHubInstallState.mockReturnValue('/all');
  auth.getGitHubStatus.mockResolvedValue({ connected: false });
  auth.getRepoVisibilityDefault.mockReturnValue('private');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('ConnectGitHubScreen', () => {
  it('sends the creator to the GitHub App installation, carrying next', async () => {
    renderConnect('/connect/github?next=%2Fall');

    fireEvent.click(await screen.findByRole('button', { name: 'Connect GitHub' }));

    expect(auth.gitHubInstallUrl).toHaveBeenCalledWith('/all');
    expect(assign).toHaveBeenCalledWith('https://github.com/apps/ogm/installations/new?state=%2Fall');
  });

  it('connects the installation GitHub returns with and shows the login', async () => {
    renderConnect('/connect/github?installation_id=4242&code=code-abc&setup_action=install&state=nonce%3A%2Fall');

    expect(await screen.findByText('@octocat')).toBeVisible();
    expect(auth.readGitHubInstallState).toHaveBeenCalledWith('nonce:/all');
    expect(auth.connectGitHubInstallation).toHaveBeenCalledTimes(1);
    expect(auth.connectGitHubInstallation).toHaveBeenCalledWith('4242', 'code-abc');
    expect(auth.getGitHubStatus).not.toHaveBeenCalled();
    expect(screen.getByTestId('location')).toHaveTextContent('/connect/github?next=%2Fall');

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Games destination' })).toBeVisible());
  });

  it('refuses a callback GitHub returned without an OAuth code', async () => {
    renderConnect('/connect/github?installation_id=4242&setup_action=install&state=nonce%3A%2Fall');

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not connect GitHub.');
    expect(auth.connectGitHubInstallation).not.toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: 'Connect GitHub' })).toBeVisible();
    expect(screen.getByTestId('location')).toHaveTextContent('/connect/github?next=%2Fall');
  });

  it('ignores a callback link this tab did not start', async () => {
    auth.readGitHubInstallState.mockReturnValue(null);
    renderConnect('/connect/github?installation_id=666&state=forged%3A%2Fall');

    expect(await screen.findByRole('button', { name: 'Connect GitHub' })).toBeVisible();
    expect(auth.connectGitHubInstallation).not.toHaveBeenCalled();
    expect(auth.getGitHubStatus).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('location')).toHaveTextContent('/connect/github?next=%2Fall');
  });

  it('keeps next when an org install comes back awaiting approval', async () => {
    auth.readGitHubInstallState.mockReturnValue('/g/1');
    renderConnect('/connect/github?setup_action=request&state=nonce%3A%2Fg%2F1');

    expect(await screen.findByRole('button', { name: 'Connect GitHub' })).toBeVisible();
    expect(auth.connectGitHubInstallation).not.toHaveBeenCalled();
    expect(screen.getByTestId('location')).toHaveTextContent('/connect/github?next=%2Fg%2F1');
  });

  it('shows a refused installation and lets the creator start again', async () => {
    auth.connectGitHubInstallation.mockRejectedValueOnce(new Error('api 409'));
    renderConnect('/connect/github?installation_id=4242&code=code-abc&state=nonce%3A%2Fall');

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not connect GitHub.');
    expect(auth.connectGitHubInstallation).toHaveBeenCalledWith('4242', 'code-abc');
    fireEvent.click(screen.getByRole('button', { name: 'Connect GitHub' }));
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it('re-enables Connect GitHub when Back restores the page from the cache', async () => {
    renderConnect();
    fireEvent.click(await screen.findByRole('button', { name: 'Connect GitHub' }));
    expect(screen.getByRole('button', { name: 'Opening GitHub…' })).toBeDisabled();

    const pageshow = Object.assign(new Event('pageshow'), { persisted: true });
    act(() => {
      window.dispatchEvent(pageshow);
    });

    expect(screen.getByRole('button', { name: 'Connect GitHub' })).toBeEnabled();
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
    renderConnect('/connect/github?next=%2Fall');

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

  it('reports an unconfigured GitHub App instead of navigating', async () => {
    auth.gitHubInstallUrl.mockReturnValue(null);
    renderConnect();

    fireEvent.click(await screen.findByRole('button', { name: 'Connect GitHub' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not connect GitHub.');
    expect(assign).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Connect GitHub' })).toBeEnabled();
  });
});
