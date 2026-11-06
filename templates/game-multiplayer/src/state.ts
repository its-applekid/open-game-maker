import type { ActionFrame } from '@ogm/contracts';

import spawnPoints from '../design/spawns.json' with { type: 'json' };
import type { PlatformDesign } from './game.js';

export const PLAYER_WIDTH = 28;
export const PLAYER_HEIGHT = 40;
export const GROUND_Y = 440;
const GRAVITY = 900;
const JUMP_SPEED = 420;

export interface Platform {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SpawnPoint {
  id: string;
  x: number;
  y: number;
}

/** One avatar. `p` is the position the SDK interpolates on peers (`entities[id].p`). */
export interface PlayerState {
  id: string;
  playerIndex: number;
  p: [number, number];
  v: [number, number];
  onGround: boolean;
  /**
   * How many jumps this seat decided to take. Nobody may receive it (netcode §5.1): `view` withholds it from every
   * recipient but its owner, and `digest` leaves it out so a hidden value can never move a shared checksum.
   */
  secret: number;
}

interface PlayerInput {
  move: number;
  jumpQueued: boolean;
}

export interface SimulationState {
  tick: number;
  players: Map<number, PlayerState>;
  platforms: Platform[];
  inputs: Map<number, PlayerInput>;
}

/** Snapshot and save shape: every visible avatar keyed by its host-minted id. */
export interface SerializedSimulation {
  tick: number;
  entities: Record<string, PlayerState>;
}

export const spawns: readonly SpawnPoint[] = spawnPoints;

/** The SDK's host-minted player id (`p<index>`), also used for the host's own avatar. */
export function playerId(playerIndex: number): string {
  return `p${playerIndex}`;
}

export function platformsFromDesign(design: PlatformDesign): Platform[] {
  return Object.values(design.entities)
    .filter((entity) => entity.prefab === 'platform')
    .map((entity) => ({
      id: entity.id,
      x: entity.props.x,
      y: entity.props.y,
      width: entity.props.w ?? 160,
      height: entity.props.h ?? 24,
    }));
}

export function addPlayer(state: SimulationState, playerIndex: number, id: string): void {
  const spawn = spawns[playerIndex % spawns.length] ?? { x: 96, y: GROUND_Y - PLAYER_HEIGHT };
  state.players.set(playerIndex, {
    id,
    playerIndex,
    p: [spawn.x, spawn.y],
    v: [0, 0],
    onGround: spawn.y + PLAYER_HEIGHT === GROUND_Y,
    secret: 0,
  });
  state.inputs.set(playerIndex, { move: 0, jumpQueued: false });
}

export function removePlayer(state: SimulationState, id: string): void {
  for (const player of state.players.values()) {
    if (player.id !== id) continue;
    state.players.delete(player.playerIndex);
    state.inputs.delete(player.playerIndex);
    return;
  }
}

export function createSimulation(design: PlatformDesign, localPlayerIndex = 0): SimulationState {
  const state: SimulationState = {
    tick: 0,
    players: new Map(),
    platforms: platformsFromDesign(design),
    inputs: new Map(),
  };
  addPlayer(state, localPlayerIndex, playerId(localPlayerIndex));
  return state;
}

/** The only place input touches the world: it is stored here and consumed by the fixed step. */
export function applyInput(state: SimulationState, playerIndex: number, frame: ActionFrame): void {
  if (!state.players.has(playerIndex)) return;
  const input = state.inputs.get(playerIndex) ?? { move: 0, jumpQueued: false };
  const move = frame.actions.move;
  if (typeof move === 'number') input.move = Math.max(-1, Math.min(1, move));
  else if (move && typeof move === 'object') input.move = Math.max(-1, Math.min(1, move.x));
  if (frame.actions.jump === true) input.jumpQueued = true;
  state.inputs.set(playerIndex, input);
}

function landingY(player: PlayerState, state: SimulationState, nextY: number): number | undefined {
  const previousBottom = player.p[1] + PLAYER_HEIGHT;
  const nextBottom = nextY + PLAYER_HEIGHT;
  let surface = nextBottom >= GROUND_Y ? GROUND_Y : undefined;

  for (const platform of state.platforms) {
    const withinX =
      player.p[0] + PLAYER_WIDTH / 2 > platform.x - platform.width / 2 &&
      player.p[0] - PLAYER_WIDTH / 2 < platform.x + platform.width / 2;
    if (withinX && previousBottom <= platform.y && nextBottom >= platform.y) {
      surface = surface === undefined ? platform.y : Math.min(surface, platform.y);
    }
  }
  return surface;
}

export function stepSimulation(state: SimulationState, design: PlatformDesign, dt: number): void {
  const speed = design.globals['player.speed'];
  const levelWidth = design.globals['level.width'];

  for (const player of state.players.values()) {
    const input = state.inputs.get(player.playerIndex) ?? { move: 0, jumpQueued: false };
    player.v[0] = input.move * speed;
    player.p[0] = Math.max(PLAYER_WIDTH / 2, Math.min(levelWidth - PLAYER_WIDTH / 2, player.p[0] + player.v[0] * dt));

    if (input.jumpQueued && player.onGround) {
      player.v[1] = -JUMP_SPEED;
      player.onGround = false;
      player.secret += 1;
    }
    input.jumpQueued = false;
    player.v[1] += GRAVITY * dt;
    const nextY = player.p[1] + player.v[1] * dt;
    const surface = player.v[1] >= 0 ? landingY(player, state, nextY) : undefined;
    if (surface === undefined) {
      player.p[1] = nextY;
      player.onGround = false;
    } else {
      player.p[1] = surface - PLAYER_HEIGHT;
      player.v[1] = 0;
      player.onGround = true;
    }
  }
  state.tick += 1;
}

export function serializeSimulation(state: SimulationState): SerializedSimulation {
  const entities: Record<string, PlayerState> = {};
  for (const player of [...state.players.values()].sort((left, right) => left.playerIndex - right.playerIndex)) {
    entities[player.id] = structuredClone(player);
  }
  return { tick: state.tick, entities };
}

export function restoreSimulation(design: PlatformDesign, saved: SerializedSimulation): SimulationState {
  const state: SimulationState = {
    tick: saved.tick,
    players: new Map(),
    platforms: platformsFromDesign(design),
    inputs: new Map(),
  };
  for (const player of Object.values(saved.entities)) {
    state.players.set(player.playerIndex, { ...structuredClone(player), secret: player.secret ?? 0 });
    state.inputs.set(player.playerIndex, { move: 0, jumpQueued: false });
  }
  return state;
}

/** Peers render the host's snapshot; inputs they already queued stay in place. */
export function applySnapshotState(state: SimulationState, saved: SerializedSimulation): void {
  state.tick = saved.tick;
  const seen = new Set<number>();
  for (const player of Object.values(saved.entities)) {
    seen.add(player.playerIndex);
    state.players.set(player.playerIndex, structuredClone(player));
    if (!state.inputs.has(player.playerIndex)) state.inputs.set(player.playerIndex, { move: 0, jumpQueued: false });
  }
  for (const playerIndex of [...state.players.keys()]) {
    if (!seen.has(playerIndex)) state.players.delete(playerIndex);
  }
}

/* ----------------------------------------------------------------------------------------------------------------
 * Per-seat authority (netcode v2).
 *
 * `capture({ seat })` returns that seat's owned slice, `capture({})` the shared slice, and `restore` applies exactly
 * the slice it is handed — one seat's avatar, or the platform list — so the SDK can reconcile three remote seats
 * without overwriting the local one. `digest` folds the whole visible state in canonical order: entities sorted by
 * id, positions and velocities in 1/256 units, `onGround` as 0/1.
 * -------------------------------------------------------------------------------------------------------------- */

export interface OwnedSlice {
  seat: number;
  player: PlayerState;
}

export interface SharedSlice {
  platforms: Platform[];
}

export function captureOwned(state: SimulationState, seat: number): OwnedSlice | undefined {
  const player = state.players.get(seat);
  return player ? { seat, player: structuredClone(player) } : undefined;
}

export function captureShared(state: SimulationState): SharedSlice {
  return { platforms: structuredClone(state.platforms) };
}

/**
 * Merge the keys the slice carries and leave every absent key at this client's own value (§3.7, D-N5-9).
 *
 * `view` withholds the private counter, so the slice a peer restores for another seat has no `secret`; rebuilding the
 * avatar from the payload would zero a field the recipient may not see and, worse, delete it from its own copy.
 */
export function restoreOwned(state: SimulationState, slice: OwnedSlice): void {
  const existing = state.players.get(slice.seat);
  const wire = slice.player as Partial<PlayerState> & Pick<PlayerState, 'p'>;
  const merged: PlayerState = {
    id: wire.id ?? existing?.id ?? playerId(slice.seat),
    playerIndex: wire.playerIndex ?? existing?.playerIndex ?? slice.seat,
    p: wire.p,
    v: wire.v ?? existing?.v ?? [0, 0],
    onGround: wire.onGround ?? existing?.onGround ?? false,
    secret: wire.secret ?? existing?.secret ?? 0,
  };
  state.players.set(slice.seat, merged);
  if (!state.inputs.has(slice.seat)) state.inputs.set(slice.seat, { move: 0, jumpQueued: false });
}

export function restoreShared(state: SimulationState, slice: SharedSlice): void {
  state.platforms = structuredClone(slice.platforms);
}

/** Seat words first (sorted by id), then the shared platform words, so two clients fold the same order. */
export function digestSimulation(state: SimulationState, toUnits: (value: number) => number): number[] {
  const words = [toUnits(state.tick)];
  const players = [...state.players.values()].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
  for (const player of players) {
    words.push(
      toUnits(player.p[0]),
      toUnits(player.p[1]),
      toUnits(player.v[0]),
      toUnits(player.v[1]),
      player.onGround ? 1 : 0,
    );
  }
  for (const platform of [...state.platforms].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  )) {
    words.push(toUnits(platform.x), toUnits(platform.y), toUnits(platform.width), toUnits(platform.height));
  }
  return words;
}
