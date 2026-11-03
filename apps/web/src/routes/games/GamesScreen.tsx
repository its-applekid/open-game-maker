import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { registerTestApi } from '../../app/testHook';
import { glideTiles, measureTiles, type TileRects } from './flip';
import { Spotlight } from './Spotlight';
import { Tile } from './Tile';
import { gameUpdatedAt, type GameSummary, type JobView } from './types';
import { indexActiveJobs, useActiveJobs } from './useActiveJobs';
import { useBranches } from './useBranches';
import { useGames } from './useGames';
import { measureGridColumns, useGridNav } from './useGridNav';
import './games.css';
import './games-responsive.css';

let gamesApiRegistered = false;
const gamesTestSnapshot: { selected: string | null; tiles: string[] } = { selected: null, tiles: [] };

export function GamesScreen() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const gamesQuery = useGames();
  const jobsQuery = useActiveJobs();
  const games = gamesQuery.data ?? [];
  const jobs = jobsQuery.data ?? [];
  const selectedId = searchParams.get('spotlight');
  const selected = games.find((game) => game.id === selectedId) ?? null;
  const branchesQuery = useBranches(selected?.id ?? null);
  const branches = branchesQuery.data ?? [];
  const gridRef = useRef<HTMLDivElement>(null);
  const previousRects = useRef<TileRects>(new Map());
  const activeJobs = useMemo(() => indexActiveJobs(jobs), [jobs]);
  const sortedGames = useMemo(() => sortGames(games, activeJobs), [games, activeJobs]);
  const selectedIndex = selected ? sortedGames.findIndex((game) => game.id === selected.id) : null;

  const select = (index: number) => {
    const game = sortedGames[index];
    if (!game) return;
    const next = new URLSearchParams(searchParams);
    next.set('spotlight', game.id);
    setSearchParams(next);
  };

  const close = () => {
    const returningTo = selected?.id;
    const next = new URLSearchParams(searchParams);
    next.delete('spotlight');
    setSearchParams(next);
    queueMicrotask(() => {
      if (!returningTo) return;
      const cell = [...(gridRef.current?.querySelectorAll<HTMLElement>('[data-game-id]') ?? [])].find(
        (item) => item.dataset.gameId === returningTo,
      );
      cell?.querySelector<HTMLButtonElement>('button')?.focus();
    });
  };

  const open = (index: number, mode: 'play' | 'edit' = 'play', branchId?: string) => {
    const game = sortedGames[index];
    const branch =
      branches.find((item) => item.id === branchId) ?? branches.find((item) => item.name === 'main') ?? branches[0];
    if (!game || game.id !== selected?.id || !branch?.latestBuildId) return;
    navigate(`/g/${encodeURIComponent(game.id)}?v=${encodeURIComponent(branch.id)}&mode=${mode}`);
  };

  const nav = useGridNav({
    count: sortedGames.length,
    selectedIndex,
    columns: () => measureGridColumns(gridRef.current),
    onSelect: select,
    onOpen: open,
    onClose: close,
    containerRef: gridRef,
  });

  useLayoutEffect(() => {
    glideTiles(gridRef.current, previousRects.current);
    previousRects.current = measureTiles(gridRef.current);
  }, [sortedGames]);

  gamesTestSnapshot.selected = selected?.id ?? null;
  gamesTestSnapshot.tiles = sortedGames.map((game) => game.id);
  useEffect(() => {
    if (gamesApiRegistered || !window.__ogmHost) return;
    gamesApiRegistered = true;
    registerTestApi('games', {
      selected: () => gamesTestSnapshot.selected,
      tiles: () => [...gamesTestSnapshot.tiles],
    });
  }, []);

  if (gamesQuery.isPending) return <p className="games-status">Loading your games…</p>;

  return (
    <div className="games-screen">
      {selected && (
        <Spotlight
          game={selected}
          branches={branches}
          job={activeJobs.get(selected.id)}
          onPlay={(branchId) => open(selectedIndex ?? -1, 'play', branchId)}
          onEdit={(branchId) => open(selectedIndex ?? -1, 'edit', branchId)}
          onClose={close}
        />
      )}

      {gamesQuery.isError && games.length === 0 ? (
        <RetryLine onRetry={() => void gamesQuery.refetch()} />
      ) : (
        <>
          {(gamesQuery.isError || branchesQuery.isError) && (
            <RetryLine
              onRetry={() => void Promise.all([gamesQuery.refetch(), jobsQuery.refetch(), branchesQuery.refetch()])}
            />
          )}
          {sortedGames.length === 0 ? (
            <p className="games-empty">No games yet. Start with a new idea.</p>
          ) : (
            <div className="games-floor">
              <div ref={gridRef} className="games-grid" role="grid" aria-label="Your games" onKeyDown={nav.onKeyDown}>
                {sortedGames.map((game, index) => (
                  <div
                    key={game.id}
                    role="gridcell"
                    data-game-id={game.id}
                    className={game.id === selected?.id ? 'is-selected' : undefined}
                  >
                    <Tile
                      game={game}
                      job={activeJobs.get(game.id)}
                      selected={game.id === selected?.id}
                      tabIndex={nav.tabIndexFor(index)}
                      onFocus={() => nav.focusAt(index)}
                      onClick={() => {
                        nav.focusAt(index);
                        select(index);
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <button type="button" className="tap-primary games-new" onClick={() => navigate('/new')}>
        <span className="plus" aria-hidden="true">
          +
        </span>
        <span>New game</span>
      </button>
    </div>
  );
}

function sortGames(games: GameSummary[], jobs: ReadonlyMap<string, JobView>): GameSummary[] {
  return [...games].sort((left, right) => {
    const building = Number(jobs.has(right.id)) - Number(jobs.has(left.id));
    return building || gameUpdatedAt(right).localeCompare(gameUpdatedAt(left));
  });
}

function RetryLine({ onRetry }: { onRetry(): void }) {
  return (
    <p className="games-retry" role="alert">
      Couldn’t refresh the library.{' '}
      <button type="button" onClick={onRetry}>
        Try again
      </button>
    </p>
  );
}
