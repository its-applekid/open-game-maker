import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import {
  connectGitHubInstallation,
  getGitHubStatus,
  getRepoVisibilityDefault,
  gitHubInstallUrl,
  readGitHubInstallState,
  safeNext,
  setRepoVisibilityDefault,
  type RepoVisibility,
} from '../../lib/api/auth';
import './connect.css';

type Status = { kind: 'loading' | 'disconnected' | 'error' } | { kind: 'connected'; login?: string };

export function ConnectGitHubScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'), '/all');
  // GitHub's install redirect: the new `installation_id`, the OAuth `code` proving this creator authorized it, and
  // our `state` (nonce and next).
  const [callback] = useState(() => ({
    installationId: params.get('installation_id'),
    code: params.get('code'),
    state: params.get('state'),
  }));
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

  const finishInstall = useCallback(async (id: string, code: string | null) => {
    setStatus({ kind: 'loading' });
    // A callback without a code means the App did not request user authorization, so ownership cannot be proven.
    if (code === null) {
      setError('Could not connect GitHub.');
      setStatus({ kind: 'disconnected' });
      return;
    }
    try {
      const account = await connectGitHubInstallation(id, code);
      if (mounted.current) setStatus({ kind: 'connected', login: account.login });
    } catch {
      if (!mounted.current) return;
      setError('Could not connect GitHub.');
      setStatus({ kind: 'disconnected' });
    }
  }, []);

  /* Runs once even when StrictMode replays the effect: the install state is single use. */
  const started = useRef(false);
  useEffect(() => {
    mounted.current = true;
    if (!started.current) {
      started.current = true;
      if (callback.state !== null) {
        // GitHub came back (an org install awaiting approval brings no installation_id). Drop the one-shot
        // callback parameters so a reload never replays them.
        const returnedNext = readGitHubInstallState(callback.state);
        navigate(`/connect/github?next=${encodeURIComponent(safeNext(returnedNext, '/all'))}`, { replace: true });
        void (callback.installationId && returnedNext !== null
          ? finishInstall(callback.installationId, callback.code)
          : loadStatus());
      } else {
        void loadStatus();
      }
    }
    return () => {
      mounted.current = false;
    };
  }, [callback, finishInstall, loadStatus, navigate]);

  // Back from GitHub restores this page from the back/forward cache with the button still disabled.
  useEffect(() => {
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) setLinking(false);
    };
    window.addEventListener('pageshow', restore);
    return () => window.removeEventListener('pageshow', restore);
  }, []);

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
