import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { authFetch, safeNext, useSession } from '../../lib/api/auth';
import '../auth.css';
import './age.css';

const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

type State = 'idle' | 'submitting' | 'refused' | 'error';

export function AgeScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'), '/signin');
  const attestationRequired = params.get('attest') === '1';
  const { data: session, isPending: sessionPending } = useSession();
  const now = new Date();
  const [birthMonth, setBirthMonth] = useState(now.getMonth() + 1);
  const [birthYear, setBirthYear] = useState(now.getFullYear());
  const [state, setState] = useState<State>('idle');
  const request = useRef<AbortController | null>(null);
  const years = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: current - 1899 }, (_, index) => current - index);
  }, []);

  useEffect(() => {
    if (!sessionPending && session && !attestationRequired) navigate(next, { replace: true });
  }, [attestationRequired, navigate, next, session, sessionPending]);

  useEffect(
    () => () => {
      request.current?.abort();
    },
    [],
  );

  if (sessionPending || (session && !attestationRequired)) return null;
  if (state === 'refused') {
    return (
      <main className="auth-screen age-screen">
        <p className="auth-refusal" role="status">
          This service is not available for you.
        </p>
      </main>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState('submitting');
    try {
      const response = await authFetch('/auth/age', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ birthMonth, birthYear }),
      });
      if (controller.signal.aborted) return;
      if (response.status === 403) {
        setState('refused');
        return;
      }
      if (!response.ok) throw new Error('Could not check your answer.');
      navigate(next, { replace: true });
    } catch {
      if (!controller.signal.aborted) setState('error');
    } finally {
      if (request.current === controller) request.current = null;
    }
  }

  return (
    <main className="auth-screen age-screen">
      <section className="auth-card">
        <h1>When were you born?</h1>
        <form aria-label="Birth date" className="age-form" onSubmit={submit}>
          <label>
            <span>Birth month</span>
            <select value={birthMonth} onChange={(event) => setBirthMonth(Number(event.target.value))}>
              {months.map((month, index) => (
                <option key={month} value={index + 1}>
                  {month}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Birth year</span>
            <select value={birthYear} onChange={(event) => setBirthYear(Number(event.target.value))}>
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
          {state === 'error' && (
            <p className="auth-error" role="alert">
              We could not check that answer. Please try again.
            </p>
          )}
          <button className="auth-primary" disabled={state === 'submitting'} type="submit">
            {state === 'submitting' ? 'Checking…' : state === 'error' ? 'Try again' : 'Continue'}
          </button>
        </form>
      </section>
    </main>
  );
}
