import { useLayoutEffect, useState, type RefObject } from 'react';

export function useGridCapacity(containerRef: RefObject<HTMLElement | null>, active: boolean): number | null {
  const [capacity, setCapacity] = useState<number | null>(null);

  useLayoutEffect(() => {
    const container = active ? containerRef.current : null;
    if (!container) {
      setCapacity(null);
      return;
    }

    const update = () => setCapacity(measureGridCapacity(container));
    update();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }

    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [active, containerRef]);

  return capacity;
}

export function measureGridCapacity(container: HTMLElement): number | null {
  const tracks = countGridTracks(getComputedStyle(container).gridTemplateColumns);
  return tracks > 0 ? tracks : null;
}

export function countGridTracks(template: string): number {
  if (!template || template === 'none') return 0;
  return topLevelTokens(template).reduce((count, token) => count + countTrack(token), 0);
}

function countTrack(track: string): number {
  const repeated = /^repeat\(\s*(\d+)\s*,([\s\S]*)\)$/.exec(track);
  if (!repeated) return track.startsWith('repeat(') ? 0 : 1;
  return Number(repeated[1]) * countGridTracks(repeated[2]!.trim());
}

function topLevelTokens(value: string): string[] {
  const tokens: string[] = [];
  let depth = 0;
  let start = 0;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    if (/\s/.test(character ?? '') && depth === 0) {
      if (value.slice(start, index).trim()) tokens.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }

  if (value.slice(start).trim()) tokens.push(value.slice(start).trim());
  return tokens;
}
