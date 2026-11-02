import type { ScopeStatus, ScopeTurn } from './useScopeSession';

export function Captions({ turns, status }: { turns: ScopeTurn[]; status: ScopeStatus }) {
  const state = status === 'connecting' ? 'Connecting' : status === 'revising' ? 'Revising scope' : 'Ready';
  return (
    <>
      <CaptionSide label="You" state={state} turns={turns.filter(({ who }) => who === 'you')} />
      <CaptionSide
        label="Builder"
        state={status === 'agreed' ? 'Ready to build' : status === 'revising' ? 'Thinking' : 'Listening'}
        turns={turns.filter(({ who }) => who === 'builder')}
      />
    </>
  );
}

function CaptionSide({
  label,
  state,
  turns,
}: {
  label: 'You' | 'Builder';
  state: string;
  turns: ScopeTurn[];
}) {
  return (
    <section className={`vs-side ${label === 'You' ? 'you' : 'agent'}`} aria-label={label}>
      <header>
        <span className="who">{label}</span>
        <span className="state">{state}</span>
      </header>
      <div className={label === 'You' ? 'scope-seis' : 'scope-orb'} aria-hidden="true" />
      <div className="caption" aria-live="polite">
        {turns.map(({ id, text }, index) => (
          <p className={`line ${index < turns.length - 1 ? 'old' : ''}`} key={id}>
            {text}
          </p>
        ))}
      </div>
    </section>
  );
}
