import { useEffect, useMemo, useRef, useState } from 'react';

import { Icon } from '../../components/Icon';
import type { AudioStyleFamily, AudioStyleTile } from './catalog';
import { OtherTile } from './OtherTile';

type View =
  { kind: 'families' } | { kind: 'grid'; familyId: string } | { kind: 'detail'; familyId: string; styleId: string };

/**
 * The Sound step: the audio-style picker styled like the Style step. A creator picks a direction (a style axis and a
 * mood axis) and hears one pre-rendered 60 s montage per tile; the choice lands on the game as that direction, never as
 * pack ids. Tiles are family-first — a style axis, then the moods within it — and a tile is offered only where the
 * builder rendered a sample, so nothing here plays an empty tile.
 */
export function AudioStyleStep({
  families,
  selected,
  other,
  full,
  onFull,
  onOtherChange,
  onSelect,
}: {
  families: AudioStyleFamily[];
  selected: string[];
  other: string | undefined;
  full: boolean;
  onFull(): void;
  onOtherChange(value: string | undefined): void;
  onSelect(id: string): void;
}) {
  const [view, setView] = useState<View>({ kind: 'families' });
  const familyId = view.kind === 'families' ? undefined : view.familyId;
  const family = useMemo(() => families.find((candidate) => candidate.id === familyId), [families, familyId]);

  const openFamily = (id: string) => {
    const styles = families.find((candidate) => candidate.id === id)?.styles ?? [];
    if (styles.length === 1) setView({ kind: 'detail', familyId: id, styleId: styles[0]!.id });
    else setView({ kind: 'grid', familyId: id });
  };

  const choose = (style: AudioStyleTile) => {
    onSelect(style.id);
    setView({ kind: 'families' });
  };

  const active = view.kind === 'detail' ? family?.styles.find((style) => style.id === view.styleId) : undefined;

  return (
    <div className="new-style-step">
      {view.kind === 'families' ? (
        <div className="new-option-grid" role="group" aria-label="How should it sound?">
          {families.map((candidate) => (
            <button
              className="new-option tap-primary"
              type="button"
              data-audio-family={candidate.id}
              onClick={() => openFamily(candidate.id)}
              key={candidate.id}
            >
              <Icon name="soundOn" className="new-option-icon" />
              <span>{candidate.label}</span>
            </button>
          ))}
          <OtherTile title="Sound" value={other} full={full} onFull={onFull} onChange={onOtherChange} />
        </div>
      ) : null}

      {view.kind === 'grid' && family ? (
        <div className="new-style-grid-view">
          <button
            className="new-style-icon-button tap-secondary"
            type="button"
            aria-label="Back to sound styles"
            onClick={() => setView({ kind: 'families' })}
          >
            <span aria-hidden="true">←</span>
          </button>
          <div className="new-style-set-grid" role="group" aria-label={`${family.label} moods`}>
            {family.styles.map((style) => (
              <button
                className="new-style-set tap-primary"
                type="button"
                aria-label={style.label}
                data-audio-style={style.id}
                onClick={() => setView({ kind: 'detail', familyId: family.id, styleId: style.id })}
                key={style.id}
              >
                <Icon name="soundOn" className="new-option-icon" />
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {view.kind === 'detail' && active ? (
        <div className="new-style-detail" role="region" aria-label={active.label}>
          <div className="new-style-showcase-detail">
            <div className="new-audio-still">
              <AudioSample key={active.id} style={active} />
            </div>
          </div>
          <button
            className="new-style-select tap-primary"
            type="button"
            aria-label={`Select ${active.label}`}
            aria-pressed={selected.includes(active.id)}
            onClick={() => choose(active)}
          >
            Select
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Plays one style's montage; leaving the detail unmounts it, so a sample never plays behind another screen. */
function AudioSample({ style }: { style: AudioStyleTile }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const element = audio.current;
    return () => {
      element?.pause();
    };
  }, []);

  const toggle = () => {
    const element = audio.current;
    if (!element) return;
    if (playing) {
      element.pause();
      setPlaying(false);
      return;
    }
    void element
      .play()
      .then(() => setPlaying(true))
      .catch(() => setPlaying(false));
  };

  return (
    <>
      <button
        className="new-audio-play tap-primary"
        type="button"
        aria-label={playing ? `Pause ${style.label}` : `Play ${style.label}`}
        aria-pressed={playing}
        onClick={toggle}
      >
        <Icon name={playing ? 'soundOff' : 'soundOn'} className="new-option-icon" />
      </button>
      <span className="new-audio-label">{style.label}</span>
      <audio ref={audio} src={style.sampleUrl} preload="none" onEnded={() => setPlaying(false)} />
    </>
  );
}
