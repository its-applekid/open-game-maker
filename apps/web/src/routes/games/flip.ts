export type TileRects = Map<string, DOMRect>;

export function measureTiles(container: HTMLElement | null): TileRects {
  return new Map(
    [...(container?.querySelectorAll<HTMLElement>('[data-game-id]') ?? [])].map((tile) => [
      tile.dataset.gameId!,
      tile.getBoundingClientRect(),
    ]),
  );
}

export function glideTiles(container: HTMLElement | null, before: TileRects): void {
  if (!container || before.size === 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  for (const tile of container.querySelectorAll<HTMLElement>('[data-game-id]')) {
    const old = before.get(tile.dataset.gameId!);
    if (!old) continue;
    const next = tile.getBoundingClientRect();
    const dx = old.left - next.left;
    const dy = old.top - next.top;
    if ((dx === 0 && dy === 0) || next.bottom < 0 || next.top > window.innerHeight || !tile.animate) continue;
    tile.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], {
      duration: 650,
      easing: 'cubic-bezier(.22,1,.36,1)',
    });
  }
}
