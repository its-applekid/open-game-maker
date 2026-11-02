import type { GameManifest, InputFrame, MultiplayerHooks } from '@ogm/contracts';

import { encodeBase64, NET_LIMITS, NetPayloadTooLargeError, packJson } from './codec.js';
import { assertInputFrameSize, decodeInputFrame } from './input-codec.js';
import type { NetRole } from './roles.js';

type Actions = GameManifest['inputs']['actions'];
type StampedInput = InputFrame & { playerIndex: number };

export interface HostChannelOptions {
  actions: Actions;
  hooks: MultiplayerHooks;
  role(): NetRole;
  localPlayerIndex(): number;
  playerCount(): number;
  send(type: 'net.snapshot', payload: { seq: number; tick: number; data: string }): void;
  acceptInput(frame: ReturnType<typeof decodeInputFrame>): void;
  emitInput(playerIndex: number, frame: ReturnType<typeof decodeInputFrame>): void;
  oversized(kind: 'input' | 'snapshot', error: unknown): void;
}

export class HostChannel {
  private snapshotSequence = 0;

  constructor(private readonly options: HostChannelOptions) {}

  receiveInput(frame: StampedInput): void {
    if (this.options.role() !== 'host' || frame.playerIndex === this.options.localPlayerIndex()) return;
    try {
      assertInputFrameSize(frame);
    } catch (error) {
      this.options.oversized('input', error);
      return;
    }
    const decoded = decodeInputFrame(frame, this.options.actions);
    this.options.emitInput(frame.playerIndex, decoded);
    this.options.acceptInput(decoded);
  }

  afterStep(tick: number): void {
    if (this.options.role() !== 'host' || this.options.playerCount() === 1 || tick % 3 !== 0) return;
    const snapshot = this.options.hooks.snapshot();
    try {
      const data = encodeBase64(packJson(snapshot, NET_LIMITS.snapshotBytes, 'snapshot'));
      this.options.send('net.snapshot', { seq: ++this.snapshotSequence, tick: snapshot.tick, data });
    } catch (error) {
      if (error instanceof NetPayloadTooLargeError) this.options.oversized('snapshot', error);
      else throw error;
    }
  }
}
