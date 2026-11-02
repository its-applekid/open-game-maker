import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';

import { Icon } from '../../components/Icon';
import { pickerFamilies, setsForFamily, type CatalogFamily, type StyleChoice } from './catalog';
import { FamilyStep } from './FamilyStep';
import { OtherTile } from './OtherTile';

type View =
  | { kind: 'families' }
  | { kind: 'grid'; familyId: string }
  | { kind: 'detail'; familyId: string; setId: string; parent: 'families' | 'grid' };

type FocusTarget = { kind: 'family' | 'set'; id: string };

export function StyleStep({
  families,
  selected,
  other,
  full,
  onFull,
  onOtherChange,
  onSelect,
}: {
  families: CatalogFamily[];
  selected: string[];
  other: string | undefined;
  full: boolean;
  onFull(): void;
  onOtherChange(value: string | undefined): void;
  onSelect(id: string): void;
}) {
  const [view, setView] = useState<View>({ kind: 'families' });
  const root = useRef<HTMLDivElement>(null);
  const focusTarget = useRef<FocusTarget | undefined>(undefined);
  const familyOptions = useMemo(() => pickerFamilies(families), [families]);
  const familyId = view.kind === 'families' ? undefined : view.familyId;
  const visibleSets = useMemo(() => (familyId ? setsForFamily(families, familyId) : []), [families, familyId]);

  useEffect(() => {
    const target = focusTarget.current;
    if (!target) return;
    focusTarget.current = undefined;
    root.current?.querySelector<HTMLButtonElement>(`[data-style-${target.kind}="${target.id}"]`)?.focus();
  }, [view]);

  const cycle = useCallback(
    (offset: number) => {
      if (view.kind !== 'detail' || visibleSets.length === 0) return;
      const index = visibleSets.findIndex((choice) => choice.id === view.setId);
      const next = visibleSets[(index + offset + visibleSets.length) % visibleSets.length]!;
      setView({ ...view, setId: next.id });
    },
    [view, visibleSets],
  );

  useEffect(() => {
    if (view.kind !== 'detail') return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.matches('input, textarea, select, [contenteditable="true"]')
      )
        return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        cycle(event.key === 'ArrowLeft' ? -1 : 1);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [cycle, view.kind]);

  const openFamily = (familyId: string) => {
    const choices = setsForFamily(families, familyId);
    if (choices.length === 1) {
      setView({ kind: 'detail', familyId, setId: choices[0]!.id, parent: 'families' });
      return;
    }
    setView({ kind: 'grid', familyId });
  };

  const backFromDetail = () => {
    if (view.kind !== 'detail') return;
    if (view.parent === 'grid') {
      focusTarget.current = { kind: 'set', id: view.setId };
      setView({ kind: 'grid', familyId: view.familyId });
      return;
    }
    focusTarget.current = { kind: 'family', id: view.familyId };
    setView({ kind: 'families' });
  };

  const choose = (choice: StyleChoice) => {
    onSelect(choice.id);
    focusTarget.current = { kind: 'family', id: view.kind === 'detail' ? view.familyId : choice.familyId };
    setView({ kind: 'families' });
  };

  const active = view.kind === 'detail' ? visibleSets.find((choice) => choice.id === view.setId) : undefined;
  const familyLabel =
    view.kind === 'families' ? '' : (familyOptions.find((family) => family.id === view.familyId)?.label ?? 'styles');

  return (
    <div className="new-style-step" ref={root}>
      {view.kind === 'families' ? (
        <div className="new-option-grid" role="group" aria-label="What should it look like?">
          <FamilyStep families={familyOptions} onOpen={openFamily} />
          <OtherTile title="Style" value={other} full={full} onFull={onFull} onChange={onOtherChange} />
        </div>
      ) : null}

      {view.kind === 'grid' ? (
        <div className="new-style-grid-view">
          <button
            className="new-style-icon-button tap-secondary"
            type="button"
            aria-label="Back to styles"
            onClick={() => {
              focusTarget.current = { kind: 'family', id: view.familyId };
              setView({ kind: 'families' });
            }}
          >
            <span aria-hidden="true">←</span>
          </button>
          <div className="new-style-set-grid" role="group" aria-label={`${familyLabel} sets`}>
            {visibleSets.map((choice) => (
              <SetTile
                key={choice.id}
                choice={choice}
                onOpen={() => setView({ kind: 'detail', familyId: view.familyId, setId: choice.id, parent: 'grid' })}
              />
            ))}
          </div>
        </div>
      ) : null}

      {view.kind === 'detail' && active ? (
        <div className="new-style-detail">
          <div className="new-style-detail-nav">
            <button
              className="new-style-icon-button tap-secondary"
              type="button"
              aria-label={view.parent === 'grid' ? `Back to ${familyLabel} sets` : 'Back to styles'}
              onClick={backFromDetail}
            >
              <span aria-hidden="true">←</span>
            </button>
            <h2>{active.label}</h2>
            <span className="new-style-cycle">
              <button
                className="new-style-icon-button tap-secondary"
                type="button"
                aria-label="Previous set"
                onClick={() => cycle(-1)}
              >
                <span aria-hidden="true">‹</span>
              </button>
              <button
                className="new-style-icon-button tap-secondary"
                type="button"
                aria-label="Next set"
                onClick={() => cycle(1)}
              >
                <span aria-hidden="true">›</span>
              </button>
            </span>
          </div>
          <ShowcaseDetail choice={active} />
          <button
            className="new-style-select tap-primary"
            type="button"
            aria-pressed={selected.includes(active.id)}
            onClick={() => choose(active)}
          >
            Select {active.label}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SetTile({ choice, onOpen }: { choice: StyleChoice; onOpen(): void }) {
  const preview =
    choice.showcase?.stops[0]?.tileFallbackUrl ?? choice.packs.find((pack) => pack.thumbnailUrl)?.thumbnailUrl;
  return (
    <button className="new-style-set tap-primary" type="button" data-style-set={choice.id} onClick={onOpen}>
      {preview ? <img src={preview} alt="" /> : <Icon name="other" className="new-option-icon" />}
      <span>{choice.label}</span>
    </button>
  );
}

function ShowcaseDetail({ choice }: { choice: StyleChoice }) {
  const [activeStop, setActiveStop] = useState(0);
  const tile = useRef<HTMLVideoElement>(null);
  const sheet = useRef<HTMLVideoElement>(null);
  const showcase = choice.showcase;
  const stop = showcase?.stops[activeStop];

  useEffect(() => setActiveStop(0), [choice.id]);

  if (!showcase) {
    const preview = choice.packs.find((pack) => pack.thumbnailUrl)?.thumbnailUrl;
    return (
      <div className="new-style-still">
        {preview ? <img src={preview} alt={`${choice.label} preview`} /> : <Icon name="other" />}
      </div>
    );
  }

  const seek = (index: number) => {
    const next = showcase.stops[index];
    if (!next) return;
    setActiveStop(index);
    if (tile.current) tile.current.currentTime = next.startSeconds;
    if (sheet.current) sheet.current.currentTime = next.startSeconds;
  };

  return (
    <>
      <div className="new-style-showcase">
        <ShowcaseTrack
          label="Diorama preview"
          videoUrl={showcase.tileVideoUrl}
          fallbackUrl={stop?.tileFallbackUrl}
          fallbackAlt={`${stop?.label ?? choice.label} diorama fallback`}
          videoRef={tile}
          onTimeUpdate={() => {
            if (tile.current && sheet.current && Math.abs(tile.current.currentTime - sheet.current.currentTime) > 0.12)
              sheet.current.currentTime = tile.current.currentTime;
          }}
        />
        <ShowcaseTrack
          label="Sprite sheets preview"
          videoUrl={showcase.sheetVideoUrl}
          fallbackUrl={stop?.sheetFallbackUrl}
          fallbackAlt={`${stop?.label ?? choice.label} sprite sheets fallback`}
          videoRef={sheet}
        />
      </div>
      <div className="new-style-stops" role="group" aria-label="Showcase regions">
        {showcase.stops.map((candidate, index) => (
          <button
            className="new-style-stop"
            type="button"
            aria-pressed={index === activeStop}
            onClick={() => seek(index)}
            key={candidate.id}
          >
            {candidate.tileFallbackUrl ? <img src={candidate.tileFallbackUrl} alt="" /> : null}
            <span>{candidate.label}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function ShowcaseTrack({
  label,
  videoUrl,
  fallbackUrl,
  fallbackAlt,
  videoRef,
  onTimeUpdate,
}: {
  label: string;
  videoUrl: string | undefined;
  fallbackUrl: string | undefined;
  fallbackAlt: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  onTimeUpdate?(): void;
}) {
  const [ready, setReady] = useState(false);
  return (
    <div className="new-style-track" data-ready={ready}>
      {fallbackUrl ? <img src={fallbackUrl} alt={fallbackAlt} /> : <Icon name="other" />}
      {videoUrl ? (
        <video
          ref={videoRef}
          src={videoUrl}
          aria-label={label}
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          onCanPlay={() => setReady(true)}
          onError={() => setReady(false)}
          onTimeUpdate={onTimeUpdate}
        />
      ) : null}
    </div>
  );
}
