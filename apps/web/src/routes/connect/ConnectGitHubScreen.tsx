import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import {
  authErrorMessage,
  connectGitHubInstallation,
  getGitHubStatus,
  getRepoVisibilityDefault,
  gitHubInstallUrl,
  safeNext,
  setRepoVisibilityDefault,
  type RepoVisibility,
} from '../../lib/api/auth';
import './connect.css';

type Status = { kind: 'loading' | 'disconnected' | 'error' } | { kind: 'connected'; login?: string };

export function ConnectGitHubScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // GitHub's install redirect brings `next` back as `state`, next to the new `installation_id`.
  const next = safeNext(params.get('next') ?? params.get('state'), '/games');
  const installationId = params.get('installation_id');
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [visibility, setVisibility] = useState<RepoVisibility>(getRepoVisibilityDefault);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);

  const loadStatus = useCallback(async () => {
    setStatus({ kind: 'loading' });
    try {
      const account = await getGitHubStatus();
      if (mounted.current) {
        setStatus(account.connected ? { kind: 'connected', login: account.login } : { kind: 'disconnected' });
      }
    } catch {
      if (mounted.current) setStatus({ kind: 'error' });
    }
  }, []);

  const finishInstall = useCallback(
    async (id: string) => {
      setStatus({ kind: 'loading' });
      // Drop the one-shot installation id so a reload or retry never replays it.
      navigate(`/connect/github?next=${encodeURIComponent(next)}`, { replace: true });
      try {
        const account = await connectGitHubInstallation(id);
        if (mounted.current) setStatus({ kind: 'connected', login: account.login });
      } catch (caught) {
        if (!mounted.current) return;
        setError(authErrorMessage(caught, 'Could not connect GitHub.'));
        setStatus({ kind: 'disconnected' });
      }
    },
    [navigate, next],
  );

  const started = useRef(false);
  useEffect(() => {
    mounted.current = true;
    if (!started.current) {
      started.current = true;
      void (installationId ? finishInstall(installationId) : loadStatus());
    }
    return () => {
      mounted.current = false;
    };
  }, [finishInstall, installationId, loadStatus]);

  function connect() {
    setError('');
    const url = gitHubInstallUrl(next);
    if (!url) {
      setError('Could not connect GitHub.');
      return;
    }
    setLinking(true);
    window.location.assign(url);
  }

  function choose(value: RepoVisibility) {
    setVisibility(value);
    setRepoVisibilityDefault(value);
  }

  return (
    <main className="auth-screen connect-screen">
      <section className="auth-card connect-card">
        <h1>Connect GitHub</h1>

        {status.kind === 'loading' && <p role="status">Checking your connection…</p>}
        {status.kind === 'error' && (
          <div className="connect-stack">
            <p className="auth-error" role="alert">
              We could not check your GitHub connection.
            </p>
            <button className="auth-method" type="button" onClick={() => void loadStatus()}>
              Try again
            </button>
          </div>
        )}
        {status.kind === 'disconnected' && (
          <button className="auth-primary" disabled={linking} type="button" onClick={connect}>
            {linking ? 'Opening GitHub…' : 'Connect GitHub'}
          </button>
        )}
        {status.kind === 'connected' && (
          <div className="connect-stack">
            <p className="github-connected">
              Connected as <strong>@{status.login ?? 'GitHub user'}</strong>
            </p>
            <fieldset className="visibility-options">
              <legend>Default game visibility</legend>
              <button
                aria-pressed={visibility === 'public'}
                className="visibility-option"
                type="button"
                onClick={() => choose('public')}
              >
                <strong>Public</strong>
              </button>
              <button
                aria-pressed={visibility === 'private'}
                className="visibility-option"
                type="button"
                onClick={() => choose('private')}
              >
                <strong>Private</strong>
              </button>
            </fieldset>
            <button className="auth-primary" type="button" onClick={() => navigate(next, { replace: true })}>
              Continue
            </button>
          </div>
        )}
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
