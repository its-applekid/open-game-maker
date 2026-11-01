import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';

import {
  authClient,
  authErrorMessage,
  getGitHubStatus,
  getRepoVisibilityDefault,
  isAgeRequiredError,
  requireAge,
  safeNext,
  setRepoVisibilityDefault,
  type RepoVisibility,
} from '../../lib/api/auth';
import './connect.css';

type Status = { kind: 'loading' | 'disconnected' | 'error' } | { kind: 'connected'; login?: string };

export function ConnectGitHubScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'), '/games');
  const returnPath = `${location.pathname}${location.search}`;
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

  useEffect(() => {
    mounted.current = true;
    void loadStatus();
    return () => {
      mounted.current = false;
    };
  }, [loadStatus]);

  async function connect() {
    setLinking(true);
    setError('');
    const callback = new URL('/connect/github', window.location.origin);
    callback.searchParams.set('next', next);
    try {
      const result = await authClient.linkSocial({ provider: 'github', callbackURL: callback.href });
      if (result.error) {
        if (isAgeRequiredError(result.error)) {
          if (mounted.current) await requireAge(returnPath);
          return;
        }
        throw result.error;
      }
    } catch (caught) {
      if (!mounted.current) return;
      if (isAgeRequiredError(caught)) await requireAge(returnPath);
      else setError(authErrorMessage(caught, 'Could not connect GitHub.'));
    } finally {
      if (mounted.current) setLinking(false);
    }
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
          <button className="auth-primary" disabled={linking} type="button" onClick={() => void connect()}>
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
