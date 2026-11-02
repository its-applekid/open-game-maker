import type { MultiplayerHooks } from '@ogm/contracts';

export type NetRole = 'host' | 'peer';

export interface NetPlayer {
  playerIndex: number;
  name: string;
  connected: boolean;
}

type PlayerListener = (playerIndex: number) => void;

export const NET_STATE_CHANGES = Symbol('gm.net.stateChanges');

export interface NetStateChanges {
  [NET_STATE_CHANGES](callback: () => void): () => void;
}

export class RoleStore {
  private currentRole: NetRole = 'host';
  private currentLocalPlayerIndex: number;
  private currentPlayers: NetPlayer[];
  private roleConfirmed = false;
  private disposed = false;
  private readonly spawned = new Set<number>();
  private readonly joinedListeners = new Set<PlayerListener>();
  private readonly leftListeners = new Set<PlayerListener>();
  private readonly stateListeners = new Set<() => void>();

  constructor(
    localPlayerIndex: number,
    private readonly hooks: MultiplayerHooks,
  ) {
    this.currentLocalPlayerIndex = localPlayerIndex;
    this.currentPlayers = [localPlayer(localPlayerIndex)];
  }

  get role(): NetRole {
    return this.currentRole;
  }

  get localPlayerIndex(): number {
    return this.currentLocalPlayerIndex;
  }

  get players(): ReadonlyArray<NetPlayer> {
    return this.currentPlayers;
  }

  onPlayerJoined(callback: PlayerListener): () => void {
    return subscribe(this.joinedListeners, callback);
  }

  onPlayerLeft(callback: PlayerListener): () => void {
    return subscribe(this.leftListeners, callback);
  }

  onStateChange(callback: () => void): () => void {
    return subscribe(this.stateListeners, callback);
  }

  updateRole(role: NetRole): void {
    if (this.disposed) return;
    const changed = role !== this.currentRole || !this.roleConfirmed;
    this.currentRole = role;
    this.roleConfirmed = true;

    if (role === 'host') {
      for (const player of this.currentPlayers) this.spawn(player.playerIndex);
    } else {
      for (const playerIndex of [...this.spawned]) this.despawn(playerIndex);
    }
    if (changed) this.emitStateChange();
  }

  updatePlayers(localPlayerIndex: number, players: ReadonlyArray<NetPlayer>): void {
    if (this.disposed) return;
    const next = [...players].sort((left, right) => left.playerIndex - right.playerIndex);
    if (localPlayerIndex === this.currentLocalPlayerIndex && samePlayers(next, this.currentPlayers)) return;
    const previousByIndex = new Map(this.currentPlayers.map((player) => [player.playerIndex, player]));
    const nextByIndex = new Map(next.map((player) => [player.playerIndex, player]));

    this.currentLocalPlayerIndex = localPlayerIndex;
    this.currentPlayers = structuredClone(next);

    for (const player of next) {
      if (previousByIndex.has(player.playerIndex)) continue;
      for (const listener of this.joinedListeners) listener(player.playerIndex);
      if (this.roleConfirmed && this.currentRole === 'host') this.spawn(player.playerIndex);
    }
    for (const player of previousByIndex.values()) {
      if (nextByIndex.has(player.playerIndex)) continue;
      for (const listener of this.leftListeners) listener(player.playerIndex);
      this.despawn(player.playerIndex);
    }
    this.emitStateChange();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.spawned.clear();
    this.joinedListeners.clear();
    this.leftListeners.clear();
    this.stateListeners.clear();
  }

  private spawn(playerIndex: number): void {
    if (playerIndex === this.currentLocalPlayerIndex || this.spawned.has(playerIndex)) return;
    this.hooks.spawn(playerIndex, playerId(playerIndex));
    this.spawned.add(playerIndex);
  }

  private despawn(playerIndex: number): void {
    if (!this.spawned.delete(playerIndex)) return;
    this.hooks.despawn(playerId(playerIndex));
  }

  private emitStateChange(): void {
    for (const listener of this.stateListeners) listener();
  }
}

function subscribe<T>(listeners: Set<T>, callback: T): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function localPlayer(playerIndex: number): NetPlayer {
  return { playerIndex, name: `Player ${playerIndex + 1}`, connected: true };
}

function playerId(playerIndex: number): string {
  return `p${playerIndex}`;
}

function samePlayers(left: ReadonlyArray<NetPlayer>, right: ReadonlyArray<NetPlayer>): boolean {
  return (
    left.length === right.length &&
    left.every((player, index) => {
      const other = right[index];
      return (
        other !== undefined &&
        player.playerIndex === other.playerIndex &&
        player.name === other.name &&
        player.connected === other.connected
      );
    })
  );
}
