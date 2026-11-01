import type { SampleBank } from './samples.js';

export interface CueMetrics {
  peakDb: number;
  rmsDb: number;
}

export interface RenderOptions {
  seconds?: number;
}

export class CueRenderer {
  constructor(
    private readonly bank: SampleBank,
    private readonly OfflineContext: typeof OfflineAudioContext,
  ) {}

  async render(id: string, options: RenderOptions = {}): Promise<CueMetrics> {
    const decoder = new this.OfflineContext(1, 1, 44_100);
    const buffer = await this.bank.loadForRender(id, decoder);
    if (!buffer) return { peakDb: -Infinity, rmsDb: -Infinity };

    const seconds = Math.min(10, Math.max(1 / buffer.sampleRate, options.seconds ?? buffer.duration));
    const context = new this.OfflineContext(1, Math.ceil(buffer.sampleRate * seconds), buffer.sampleRate);
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = 1;
    source.connect(gain).connect(context.destination);
    source.start();

    const rendered = await context.startRendering();
    const samples = rendered.getChannelData(0);
    let peak = 0;
    let energy = 0;
    for (const sample of samples) {
      const magnitude = Math.abs(sample);
      peak = Math.max(peak, magnitude);
      energy += sample * sample;
    }
    return {
      peakDb: decibels(peak),
      rmsDb: decibels(Math.sqrt(energy / samples.length)),
    };
  }
}

const decibels = (amplitude: number): number => (amplitude === 0 ? -Infinity : 20 * Math.log10(amplitude));
