import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';

import type { AllowanceExceeded, BudgetStatus, ScopeChoices } from '@ogm/contracts';

import { api } from '../../lib/api/client';
import { useSession } from '../../lib/api/session';
import { formatUnits } from '../build-chat/units';
import { admitNewGame, type AdmissionResult } from './admit';
import { Captions } from './Captions';
import { Composer } from './Composer';
import { Offers } from './Offers';
import { useScopeSession } from './useScopeSession';

export function ScopeChat({
  gameId,
  choices,
  onSession,
}: {
  gameId: string;
  choices: ScopeChoices;
  onSession?(sessionId: string): void;
}) {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const scopeSession = useScopeSession(gameId, choices);
  const [refusal, setRefusal] = useState<Extract<AdmissionResult, { kind: 'refused' }>>();
  const [attempt, setAttempt] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [admissionError, setAdmissionError] = useState('');
  const [waitingForAdmin, setWaitingForAdmin] = useState(false);
  const budget = useQuery({
    queryKey: ['new-game', 'budget', gameId],
    queryFn: () => api<BudgetStatus>('/budget/status'),
    enabled: waitingForAdmin,
    refetchInterval: waitingForAdmin ? 30_000 : false,
  });

  useEffect(() => {
    if (scopeSession.sessionId) onSession?.(scopeSession.sessionId);
  }, [onSession, scopeSession.sessionId]);

  const admit = async (start: 'now' | 'at_reset') => {
    if (!scopeSession.sessionId || !scopeSession.scope) return;
    setSubmitting(true);
    setAdmissionError('');
    try {
      const result = await admitNewGame(
        { gameId, sessionId: scopeSession.sessionId, scope: scopeSession.scope, attempt, start },
        { request: api, navigate },
      );
      if (result.kind === 'refused') setRefusal(result);
      setAttempt((current) => current + 1);
    } catch {
      setAdmissionError('The build could not be started. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const choose = async (offer: AllowanceExceeded['offers'][number]) => {
    if (offer === 'queue') return admit('at_reset');
    if (offer === 'ask_admin') {
      setWaitingForAdmin(true);
      return;
    }
    setSubmitting(true);
    setAdmissionError('');
    try {
      await scopeSession.requestRevision(
        offer === 'trim'
          ? '[trim] Make this first build smaller, then agree a revised scope.'
          : '[split] Split this into a smaller first build, then agree a revised scope.',
      );
      setRefusal(undefined);
      setWaitingForAdmin(false);
    } catch {
      setAdmissionError('The scope could not be revised. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (scopeSession.status === 'unavailable' || scopeSession.status === 'error') {
    return (
      <div className="talk-host">
        <section className="vs two" aria-label="Scope conversation">
          <p className="scope-error" role="alert">{scopeSession.error}</p>
          <footer className="scope-controls">
            <span className="grow" />
            <button className="scope-finish tap-primary" type="button" disabled>Finish</button>
          </footer>
        </section>
      </div>
    );
  }

  return (
    <div className="talk-host">
      <section className="vs two" aria-label="Scope conversation">
        <Captions turns={scopeSession.turns} status={scopeSession.status} />
        {scopeSession.jobId ? (
          <Composer
            jobId={scopeSession.jobId}
            voiceTarget={
              scopeSession.sessionId && session?.user.id
                ? { kind: 'scope', game_id: gameId, session_id: scopeSession.sessionId, creator_id: session.user.id }
                : undefined
            }
            postText={(_jobId, text) => scopeSession.send(text)}
            onOptimistic={scopeSession.addMessage}
          />
        ) : null}
        {refusal && !waitingForAdmin ? (
          <Offers offers={refusal.offers} disabled={submitting} onChoose={(offer) => void choose(offer)} />
        ) : null}
        {waitingForAdmin ? (
          <AllowanceStatus budget={budget.data} fallback={refusal} disabled={submitting} onTry={() => void admit('now')} />
        ) : null}
        {admissionError ? <p className="scope-admission-error" role="alert">{admissionError}</p> : null}
        <footer className="scope-controls">
          <span className="grow" />
          <button
            className="scope-finish tap-primary"
            type="button"
            disabled={!scopeSession.scope || submitting || Boolean(refusal) || waitingForAdmin}
            onClick={() => void admit('now')}
          >
            {submitting ? 'Starting…' : 'Finish'}
          </button>
        </footer>
      </section>
    </div>
  );
}

function AllowanceStatus({
  budget,
  fallback,
  disabled,
  onTry,
}: {
  budget?: BudgetStatus;
  fallback?: Extract<AdmissionResult, { kind: 'refused' }>;
  disabled: boolean;
  onTry(): void;
}) {
  const reset = budget?.resetsAt ?? fallback?.resetsAt;
  const canTry =
    budget !== undefined &&
    (budget.freeSlots.new_game > 0 || budget.remainingMicroUsd > (fallback?.remainingMicroUsd ?? budget.remainingMicroUsd));
  return (
    <section className="scope-allowance" aria-label="Allowance status">
      <b>{budget ? `${formatUnits(budget.remainingMicroUsd, budget.unitLabel)} remain` : 'Checking your allowance…'}</b>
      {reset ? <span>Resets {new Date(reset).toLocaleString()}</span> : null}
      <button className="tap-secondary" disabled={disabled || !canTry} type="button" onClick={onTry}>Try again</button>
    </section>
  );
}
