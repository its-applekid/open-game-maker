import type { ActionFrame, GameManifest, InputFrame, MultiplayerHooks } from '@ogm/contracts';

import { assertByteLength, decodeBase64, NET_LIMITS, NetPayloadTooLargeError, unpackJson } from './codec.js';
import { encodeInputFrame } from './input-codec.js';
import type { NetRole } from './roles.js';

type Actions = GameManifest['inputs']['actions'];

export interface WireSnapshot {
  seq: number;
  tick: number;
  data: string;
}

interface BufferedSnapshot {
  receivedAt: number;
  snapshot: { tick: number; state: unknown };
}

export interface PeerChannelOptions {
  actions: Actions;
  hooks: MultiplayerHooks;
  role(): NetRole;
  localPlayerIndex(): number;
  send(type: 'net.input', payload: { f: InputFrame }): void;
  now(): number;
  droppedSnapshot(): void;
  invalidSnapshot(): void;
  stalled(): void;
  oversized(kind: 'input' | 'snapshot', error: unknown): void;
}

export class PeerChannel {
  private inputSequence = 0;
  private lastSnapshotSequence = 0;
  private readonly snapshots: BufferedSnapshot[] = [];
  private peerEnteredAt: number | undefined;
  private lastSnapshotAt: number | undefined;
  private stallReported = false;

  constructor(private readonly options: PeerChannelOptions) {}

  enterPeer(): void {
    this.peerEnteredAt = this.options.now();
    this.stallReported = false;
  }

  sendFrames(frames: ActionFrame[]): void {
    if (this.options.role() !== 'peer') return;
    const local = frames.find((frame) => frame.playerIndex === this.options.localPlayerIndex());
    if (!local) return;
    try {
      const f = encodeInputFrame(local, this.options.actions, ++this.inputSequence);
      this.options.send('net.input', { f });
    } catch (error) {
      if (error instanceof NetPayloadTooLargeError) this.options.oversized('input', error);
      else throw error;
    }
  }

  receiveSnapshot(message: WireSnapshot): void {
    if (this.options.role() !== 'peer') return;
    if (message.seq <= this.lastSnapshotSequence) {
      this.options.droppedSnapshot();
      return;
    }

    try {
      const bytes = decodeBase64(message.data);
      assertByteLength(bytes, NET_LIMITS.snapshotBytes, 'snapshot');
      const snapshot = unpackJson<{ tick: number; state: unknown }>(bytes);
      const receivedAt = this.options.now();
      this.lastSnapshotSequence = message.seq;
      this.lastSnapshotAt = receivedAt;
      this.stallReported = false;
      this.snapshots.push({ receivedAt, snapshot });
      while (this.snapshots.length > 3) this.snapshots.shift();
    } catch (error) {
      if (error instanceof NetPayloadTooLargeError) this.options.oversized('snapshot', error);
      else this.options.invalidSnapshot();
    }
  }

  render(): void {
    if (this.options.role() !== 'peer') return;
    const now = this.options.now();
    const trafficAt = this.lastSnapshotAt ?? this.peerEnteredAt ?? now;
    if (!this.stallReported && now - trafficAt >= 2_000) {
      this.stallReported = true;
      this.options.stalled();
    }
    if (this.snapshots.length === 0) return;

    const target = now - 100;
    const laterIndex = this.snapshots.findIndex(({ receivedAt }) => receivedAt >= target);
    if (laterIndex < 0) {
      this.options.hooks.applySnapshot(structuredClone(this.snapshots.at(-1)!.snapshot));
      return;
    }
    if (laterIndex === 0) {
      this.options.hooks.applySnapshot(structuredClone(this.snapshots[0]!.snapshot));
      return;
    }

    const earlier = this.snapshots[laterIndex - 1]!;
    const later = this.snapshots[laterIndex]!;
    const span = later.receivedAt - earlier.receivedAt;
    const amount = span === 0 ? 1 : (target - earlier.receivedAt) / span;
    this.options.hooks.applySnapshot({
      tick: later.snapshot.tick,
      state: interpolateState(earlier.snapshot.state, later.snapshot.state, amount),
    });
  }
}

export function interpolateState(previous: unknown, next: unknown, amount: number): unknown {
  const result = structuredClone(next);
  if (!isRecord(previous) || !isRecord(result)) return result;
  const previousEntities = previous.entities;
  const nextEntities = result.entities;
  if (!isRecord(previousEntities) || !isRecord(nextEntities)) return result;

  for (const [entityId, nextEntity] of Object.entries(nextEntities)) {
    const previousEntity = previousEntities[entityId];
    if (!isRecord(previousEntity) || !isRecord(nextEntity)) continue;
    if ('p' in nextEntity && 'p' in previousEntity)
      nextEntity.p = interpolateValue(previousEntity.p, nextEntity.p, amount);
    if ('r' in nextEntity && 'r' in previousEntity)
      nextEntity.r = interpolateValue(previousEntity.r, nextEntity.r, amount, true);
  }
  return result;
}

function interpolateValue(previous: unknown, next: unknown, amount: number, rotation = false): unknown {
  if (typeof previous === 'number' && typeof next === 'number') return previous + (next - previous) * amount;
  if (Array.isArray(previous) && Array.isArray(next) && previous.length === next.length) {
    if (rotation && next.length === 4 && previous.every(isNumber) && next.every(isNumber)) {
      return interpolateQuaternion(previous, next, amount);
    }
    return next.map((value, index) => interpolateValue(previous[index], value, amount));
  }
  if (isRecord(previous) && isRecord(next)) {
    const result = structuredClone(next);
    for (const key of Object.keys(result)) {
      if (key in previous) result[key] = interpolateValue(previous[key], result[key], amount);
    }
    return result;
  }
  return structuredClone(next);
}

function interpolateQuaternion(previous: number[], next: number[], amount: number): number[] {
  const dot = previous.reduce((sum, value, index) => sum + value * next[index]!, 0);
  const target = dot < 0 ? next.map((value) => -value) : next;
  const mixed = previous.map((value, index) => value + (target[index]! - value) * amount);
  const length = Math.hypot(...mixed);
  return length === 0 ? [...target] : mixed.map((value) => value / length);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}
