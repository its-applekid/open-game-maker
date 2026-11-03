import { useEffect, useRef, useState } from 'react';

import type { GameFrameState } from '../../features/editor/frame';
import { Cover } from '../games/Cover';

type LoadingGame = { familyId: string; title: string; coverUrl?: string | null };
type LayerPhase = 'waiting' | 'visible' | 'leaving' | 'removed';

const REVEAL_DELAY_MS = 150;
const FADE_MS = 220;

export function LoadingLayer({ game, load }: { game: LoadingGame; load?: GameFrameState['load'] }) {
  const done = load?.done === true;
  const doneRef = useRef(done);
  const [phase, setPhase] = useState<LayerPhase>('waiting');
  doneRef.current = done;

  useEffect(() => {
    const timer = setTimeout(() => setPhase(doneRef.current ? 'removed' : 'visible'), REVEAL_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!done) {
      if (phase === 'removed' || phase === 'leaving') setPhase('visible');
      return;
    }
    if (phase === 'visible') {
      if (prefersReducedMotion()) setPhase('removed');
      else setPhase('leaving');
      return;
    }
    if (phase !== 'leaving') return;
    const timer = setTimeout(() => setPhase('removed'), FADE_MS);
    return () => clearTimeout(timer);
  }, [done, phase]);

  if (phase === 'waiting' || phase === 'removed') return null;

  const percent =
    load === undefined || load.total <= 0 ? 0 : Math.round(Math.min(1, Math.max(0, load.loaded / load.total)) * 100);
  return (
    <div className={`game-loading-layer${phase === 'leaving' ? ' is-done' : ''}`}>
      <div className="game-loading-cover">
        <Cover game={game} />
      </div>
      <div className="game-loading-glass">
        <div
          className="game-loading-progress"
          role="progressbar"
          aria-label="Loading"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <span style={{ width: `${percent}%` }} />
        </div>
      </div>
    </div>
  );
}

function prefersReducedMotion(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
