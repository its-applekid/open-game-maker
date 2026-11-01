import { FocusContext, init, setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { useEffect, type ReactNode } from 'react';

import { ZONE_EVENT } from './gamepad';

// Spatial focus for the menus (Norigin, MIT, 491 stars: Kevin's approved exception to the 1k rule). Arrow keys, real or
// synthesised by the gamepad poller, move focus between focusables; LB/RB jump between zones in page order.
let started = false;
export function initFocus(): void {
  if (started) return;
  started = true;
  init({ shouldFocusDOMNode: true });
  window.addEventListener(ZONE_EVENT, (e) => cycleZone((e as CustomEvent<'prev' | 'next'>).detail));
}

export function FocusZone({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  const { ref, focusKey } = useFocusable({ focusKey: id, trackChildren: true, saveLastFocusedChild: true });
  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref} className={className} data-focus-zone={id}>
        {children}
      </div>
    </FocusContext.Provider>
  );
}

// focus the zone's first focusable once it has mounted
export function useInitialFocus(id: string): void {
  useEffect(() => {
    if (started) setFocus(id);
  }, [id]);
}

function cycleZone(dir: 'prev' | 'next'): void {
  const zones = [...document.querySelectorAll<HTMLElement>('[data-focus-zone]')];
  if (zones.length === 0) return;
  const current = zones.findIndex((z) => z.contains(document.activeElement));
  const step = dir === 'next' ? 1 : -1;
  const next = zones[(current + step + zones.length) % zones.length]!;
  setFocus(next.dataset.focusZone!);
}

export { useFocusable };
