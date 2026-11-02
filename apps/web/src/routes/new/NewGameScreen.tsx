import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { registerTestApi } from '../../app/testHook';
import { ScopeChat } from '../../features/scope-chat';
import { styleChoices, useCatalog } from './catalog';
import { FamilyStep } from './FamilyStep';
import { OptionTile } from './OptionTile';
import { OtherTile } from './OtherTile';
import {
  STEP_ORDER,
  STATIC_STEPS,
  choiceLabels,
  scopeChoicesFrom,
  viewsFor,
  type ChoiceKey,
  type NewGameChoices,
  type Option,
  type StepChoice,
  type StepDefinition,
  type StepKey,
} from './options';
import { useCreateGame } from './useCreateGame';
import './new.css';

const VIEW_LABELS: Record<string, string> = {
  iso: 'Isometric',
  topdown: 'Top-down',
  side: 'Side view',
  follow: 'Follow',
  fps: 'First person',
  orbit: 'Orbit',
  fixed: 'Fixed',
};

const STEP_COLORS: Record<ChoiceKey, string> = {
  genre: '#fe8019',
  vibe: '#d3869b',
  family: '#83a598',
  world: '#b8bb26',
  players: '#8ec07c',
  view: '#fabd2f',
};

const testState: { step: StepKey; picks: NewGameChoices; sessionId?: string } = {
  step: 'genre',
  picks: {},
};
let testApiRegistered = false;

export function NewGameScreen() {
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const [choices, setChoices] = useState<NewGameChoices>({});
  const [notice, setNotice] = useState('');
  const [gameId, setGameId] = useState<string>();
  const [createError, setCreateError] = useState('');
  const [createAttempt, setCreateAttempt] = useState(0);
  const ensureGame = useCreateGame();
  const catalog = useCatalog();
  const families = useMemo(() => styleChoices(catalog.data ?? []), [catalog.data]);
  const step = validStep(search.get('step'));
  const stepIndex = STEP_ORDER.indexOf(step);
  const selectedFamily = families.find(({ id }) => id === choices.family?.picks[0]);

  testState.step = step;
  testState.picks = choices;
  useEffect(() => {
    if (testApiRegistered || !window.__ogmHost) return;
    registerTestApi('new', {
      get step() {
        return testState.step;
      },
      get picks() {
        return testState.picks;
      },
      get sessionId() {
        return testState.sessionId;
      },
    });
    testApiRegistered = true;
  }, []);

  useEffect(() => {
    if (step !== 'talk' || gameId) return;
    let current = true;
    setCreateError('');
    void ensureGame(choices, selectedFamily?.requiresPrivate)
      .then((id) => {
        if (current) setGameId(id);
      })
      .catch(() => {
        if (current) setCreateError('The game could not be created. Try again.');
      });
    return () => {
      current = false;
    };
  }, [choices, createAttempt, ensureGame, gameId, selectedFamily?.requiresPrivate, step]);

  const go = (next: StepKey) => {
    const params = new URLSearchParams(search);
    params.set('step', next);
    setSearch(params);
    setNotice('');
  };

  const setChoice = (key: ChoiceKey, next: StepChoice) =>
    setChoices((current) => ({ ...current, [key]: next }));

  const toggle = (key: ChoiceKey, id: string, max: number) => {
    const current = choices[key] ?? { picks: [] };
    if (current.picks.includes(id)) {
      setChoice(key, { ...current, picks: current.picks.filter((pick) => pick !== id) });
      return;
    }
    if (current.picks.length + (current.other ? 1 : 0) >= max) {
      setNotice('Unpick one first.');
      return;
    }
    setChoice(key, { ...current, picks: max === 1 ? [id] : [...current.picks, id] });
    setNotice('');
  };

  const back = () => {
    if (stepIndex === 0) navigate('/games');
    else go(STEP_ORDER[stepIndex - 1]!);
  };

  const current = step === 'talk' ? undefined : stepDefinition(step, families, selectedFamily?.views, choices.genre?.picks);
  const selected = current ? choices[current.key] ?? { picks: [] } : undefined;
  const count = selected ? selected.picks.length + (selected.other ? 1 : 0) : 0;

  return (
    <section className="new-game-screen">
      <header className="new-game-head">
        <button className="new-back tap-secondary" type="button" onClick={back}>
          Back
        </button>
        <div>
          <h1>{step === 'talk' ? 'Talk it through' : current?.title}</h1>
          <div className="new-dots" aria-label={`Step ${stepIndex + 1} of ${STEP_ORDER.length}`}>
            {STEP_ORDER.map((key, index) => (
              <i className={index < stepIndex ? 'done' : index === stepIndex ? 'now' : ''} key={key} />
            ))}
          </div>
        </div>
      </header>

      <div
        className="new-game-body"
        data-step={step}
        style={{ '--new-color': STEP_COLORS[step as ChoiceKey] } as CSSProperties & { '--new-color'?: string }}
      >
        {step === 'talk' ? (
          <TalkStep
            choices={choices}
            gameId={gameId}
            createError={createError}
            onRetry={() => setCreateAttempt((current) => current + 1)}
            onSession={(sessionId) => {
              testState.sessionId = sessionId;
            }}
          />
        ) : (
          <>
            <p className="new-ask">{current?.ask}</p>
            <p className="new-hint">{current?.hint}</p>
            {notice ? <p role="status" className="new-notice">{`${current?.hint.split('·')[0].trim()}. ${notice}`}</p> : null}
            {step === 'family' && catalog.isError ? (
              <p className="new-retry" role="alert">
                Style choices are unavailable.{' '}
                <button type="button" onClick={() => void catalog.refetch()}>
                  Retry
                </button>
              </p>
            ) : (
              <div className="new-option-grid" role="group" aria-label={current?.ask}>
                {step === 'family' ? (
                  <FamilyStep
                    choices={families}
                    selected={selected?.picks ?? []}
                    onToggle={(id) => toggle('family', id, 1)}
                  />
                ) : (
                  current?.options.map((item) => (
                    <OptionTile
                      key={item.id}
                      {...item}
                      pressed={selected?.picks.includes(item.id) ?? false}
                      onToggle={() => toggle(current.key, item.id, current.max)}
                    />
                  ))
                )}
                {current ? (
                  <OtherTile
                    title={current.title}
                    value={selected?.other}
                    full={count >= current.max}
                    onFull={() => setNotice('Unpick one first.')}
                    onChange={(other) => setChoice(current.key, { picks: selected?.picks ?? [], ...(other ? { other } : {}) })}
                  />
                ) : null}
              </div>
            )}
          </>
        )}
      </div>

      {step !== 'talk' ? (
        <footer className="new-game-foot">
          <button className="new-next tap-primary" type="button" onClick={() => go(STEP_ORDER[stepIndex + 1] ?? 'talk')}>
            {count ? 'Next' : 'Skip'}
          </button>
        </footer>
      ) : null}
    </section>
  );
}

function validStep(value: string | null): StepKey {
  return STEP_ORDER.includes(value as StepKey) ? (value as StepKey) : 'genre';
}

function stepDefinition(
  step: Exclude<StepKey, 'talk'>,
  families: { id: string; label: string }[],
  familyViews: string[] | undefined,
  genres: string[] | undefined,
): StepDefinition {
  if (step === 'family') {
    return { key: 'family', title: 'Style', ask: 'What should it look like?', hint: 'Pick one', max: 1, options: families };
  }
  if (step === 'view') {
    const options: Option[] = viewsFor(familyViews ?? ['fixed'], genres ?? []).map((id) => ({
      id,
      label: VIEW_LABELS[id] ?? id,
    }));
    return { key: 'view', title: 'Point of view', ask: 'How do you see it?', hint: 'Pick one', max: 1, options };
  }
  return STATIC_STEPS[step];
}

function TalkStep({
  choices,
  gameId,
  createError,
  onRetry,
  onSession,
}: {
  choices: NewGameChoices;
  gameId?: string;
  createError: string;
  onRetry(): void;
  onSession(sessionId: string): void;
}) {
  const rows = (Object.keys(choices) as ChoiceKey[]).flatMap((key) => {
    const choice = choices[key];
    const labels = choiceLabels(key, choice);
    if (choice?.other) labels.push(`“${choice.other}”`);
    return labels.length > 0 ? [{ key, labels }] : [];
  });
  return (
    <>
      <p className="new-ask">Tell the builder about your game</p>
      <p className="new-hint">Talk or type. Press Finish whenever you have said enough.</p>
      <div className="new-summary">
        {rows.length > 0 ? (
          rows.map((row) => (
            <span className="new-summary-row" key={row.key}>
              <b>{row.key === 'family' ? 'Style' : row.key}</b>
              {row.labels.map((label) => (
                <span className="new-chip" key={label}>{label}</span>
              ))}
            </span>
          ))
        ) : (
          <span className="new-summary-row muted">No picks yet. That is fine: just tell the builder about your game.</span>
        )}
      </div>
      {createError ? (
        <p role="alert">
          The game could not be created. <button type="button" onClick={onRetry}>Try again</button>
        </p>
      ) : null}
      {gameId ? (
        <ScopeChat gameId={gameId} choices={scopeChoicesFrom(choices)} onSession={onSession} />
      ) : createError ? null : (
        <p role="status">Creating your game…</p>
      )}
    </>
  );
}
