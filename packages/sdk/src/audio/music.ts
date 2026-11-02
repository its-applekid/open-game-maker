import type { SampleBank } from './samples.js';

export interface MusicOptions {
  fade?: number;
  vol?: number;
  loop?: [number, number];
}

interface Track {
  name: string;
  source: AudioBufferSourceNode;
  gain: GainNode;
}

export class MusicPlayer {
  private readonly introDone = new Set<string>();
  private current: Track | null = null;
  private wanted: { id: string; options: MusicOptions } | null = null;
  private generation = 0;

  constructor(
    private readonly context: AudioContext,
    private readonly bus: GainNode,
    private readonly bank: SampleBank,
  ) {}

  play(id: string | null, options: MusicOptions = {}): void {
    this.wanted = id ? { id, options } : null;
    if (id && this.current?.name === id) return;
    this.generation += 1;
    const fade = options.fade ?? 1.2;
    this.endCurrent(fade);
    if (id && this.context.state === 'running') void this.start(id, options, this.generation);
  }

  replay(): void {
    if (!this.wanted || this.context.state !== 'running') return;
    if (this.current?.name === this.wanted.id) return;
    this.generation += 1;
    this.endCurrent(0.8);
    void this.start(this.wanted.id, this.wanted.options, this.generation);
  }

  stop(): void {
    this.wanted = null;
    this.generation += 1;
    this.endCurrent(0);
  }

  private async start(id: string, options: MusicOptions, generation: number): Promise<void> {
    const buffer = await this.bank.load(id);
    if (!buffer || generation !== this.generation || this.context.state !== 'running') return;

    const { fade = 1.2, vol = 1, loop } = options;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    source.loop = true;
    if (loop) [source.loopStart, source.loopEnd] = loop;
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(vol, this.context.currentTime, fade / 4);
    source.connect(gain).connect(this.bus);
    source.start(0, loop && this.introDone.has(id) ? loop[0] : 0);
    this.introDone.add(id);
    this.current = { name: id, source, gain };
  }

  private endCurrent(fade: number): void {
    if (!this.current) return;
    const old = this.current;
    this.current = null;
    old.gain.gain.cancelScheduledValues(this.context.currentTime);
    old.gain.gain.setTargetAtTime(0, this.context.currentTime, Math.max(fade / 4, 0.001));
    old.source.stop(this.context.currentTime + fade * 2);
  }
}
