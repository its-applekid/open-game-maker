import { useEffect, useState } from 'react';

import { Dictation, type DictationTranscript } from '@ogm/voice-client';

import { Icon } from '../../components/Icon';

type Mode = 'face' | 'pick' | 'type';
type OtherDictation = {
  pressStart(): void;
  pressEnd(): void;
  on(event: 'transcript', listener: (transcript: DictationTranscript) => void): () => void;
};

export function OtherTile({
  title,
  value,
  full,
  limitFeedback = 0,
  onChange,
  onFull,
  dictation: providedDictation,
}: {
  title: string;
  value?: string;
  full: boolean;
  limitFeedback?: number;
  onChange(value?: string): void;
  onFull(): void;
  dictation?: OtherDictation;
}) {
  const [mode, setMode] = useState<Mode>('face');
  const [draft, setDraft] = useState(value ?? '');
  const [dictation] = useState<OtherDictation | undefined>(
    () => providedDictation ?? (Dictation.isSupported() ? new Dictation() : undefined),
  );

  useEffect(() => {
    if (!dictation) return;
    const offTranscript = dictation.on('transcript', (transcript: DictationTranscript) => {
      if (transcript.kind !== 'final') return;
      setDraft(transcript.text);
      setMode('type');
    });
    return () => {
      dictation.pressEnd();
      offTranscript();
    };
  }, [dictation]);

  if (value) {
    return (
      <div
        className={`new-option new-other filled${limitFeedback ? ' new-limit-shake' : ''}`}
        aria-pressed="true"
        data-limit-feedback={limitFeedback ? limitFeedback % 2 : undefined}
      >
        <span className="new-other-text">“{value}”</span>
        <span className="new-other-actions">
          <button
            className="new-mini tap-secondary"
            type="button"
            aria-label="Edit"
            onClick={() => {
              setDraft(value);
              setMode('type');
            }}
          >
            <Icon name="pencil" />
          </button>
          <button className="new-mini tap-secondary" type="button" aria-label="Remove" onClick={() => onChange()}>
            ×
          </button>
        </span>
      </div>
    );
  }

  if (mode === 'type') {
    return (
      <form
        className="new-option new-other typing"
        onSubmit={(event) => {
          event.preventDefault();
          const next = draft.trim();
          if (next) onChange(next);
          setMode('face');
        }}
      >
        <label className="sr" htmlFor={`new-other-${title}`}>
          Your own {title.toLowerCase()}
        </label>
        <textarea
          id={`new-other-${title}`}
          rows={3}
          placeholder="Describe it…"
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button className="new-small-button" type="submit">
          Add
        </button>
      </form>
    );
  }

  if (mode === 'pick') {
    return (
      <div className="new-option new-other picked">
        <button className="new-other-choice" type="button" aria-label="Type it" onClick={() => setMode('type')}>
          <Icon name="pencil" />
          <span>Type</span>
        </button>
        <button
          className="new-other-choice"
          type="button"
          aria-label="Say it"
          disabled={!dictation}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture?.(event.pointerId);
            dictation?.pressStart();
          }}
          onPointerUp={() => dictation?.pressEnd()}
          onPointerCancel={() => dictation?.pressEnd()}
        >
          <Icon name="speak" />
          <span>Say it</span>
        </button>
      </div>
    );
  }

  return (
    <button
      className="new-option new-other tap-primary"
      type="button"
      aria-label="Other"
      onClick={() => {
        if (full) onFull();
        else setMode('pick');
      }}
    >
      <Icon name="other" className="new-option-icon" />
      <span>Other</span>
    </button>
  );
}
