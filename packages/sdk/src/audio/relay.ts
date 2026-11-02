import type { GameToHost } from '@ogm/contracts/bridge';

export type AudioRelayPayload = Extract<GameToHost, { t: 'audio.relay' }>['payload'];

export interface AudioBridge {
  send(type: 'audio.relay', payload: AudioRelayPayload): void;
}

export class AudioRelay {
  enabled = false;
  private loop: string | null = null;

  constructor(private readonly bridge?: AudioBridge) {}

  setEnabled(enabled: boolean): void {
    if (!enabled && this.enabled && this.loop) this.bridge?.send('audio.relay', { loop: this.loop, gain: 0 });
    this.enabled = enabled;
    if (!enabled) this.loop = null;
  }

  play(cue: string, vol: number, rate: number): boolean {
    if (!this.enabled) return false;
    this.bridge?.send('audio.relay', { cue, vol, rate });
    return true;
  }

  music(id: string | null, gain: number): boolean {
    if (!this.enabled) return false;
    if (id) {
      if (this.loop && this.loop !== id) this.bridge?.send('audio.relay', { loop: this.loop, gain: 0 });
      this.loop = id;
      this.bridge?.send('audio.relay', { loop: id, gain });
    } else if (this.loop) {
      this.bridge?.send('audio.relay', { loop: this.loop, gain: 0 });
      this.loop = null;
    }
    return true;
  }
}
