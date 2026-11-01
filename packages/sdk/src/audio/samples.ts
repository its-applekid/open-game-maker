import type { AudioBuses, BusName } from './context.js';

export interface AudioLoader {
  audio(id: string): Promise<AudioBuffer>;
  resolve?(id: string): { url: string };
}

interface SampleBankOptions {
  context: AudioContext;
  loader?: AudioLoader;
  fetch: typeof globalThis.fetch;
  resolveUrl: (id: string) => string;
  logger: Pick<Console, 'warn'>;
}

export class SampleBank {
  private readonly live = new Map<string, Promise<AudioBuffer | null>>();
  private readonly bytes = new Map<string, Promise<ArrayBuffer>>();
  private readonly warned = new Set<string>();

  constructor(private readonly options: SampleBankOptions) {}

  load(id: string): Promise<AudioBuffer | null> {
    const found = this.live.get(id);
    if (found) return found;
    const request = this.decode(id, this.options.context);
    this.live.set(id, request);
    return request;
  }

  loadForRender(id: string, decoder: BaseAudioContext): Promise<AudioBuffer | null> {
    return this.safe(id, async () => decoder.decodeAudioData((await this.fetchBytes(id)).slice(0)));
  }

  private decode(id: string, decoder: BaseAudioContext): Promise<AudioBuffer | null> {
    if (this.options.loader) return this.safe(id, () => this.options.loader!.audio(id));
    return this.safe(id, async () => decoder.decodeAudioData((await this.fetchBytes(id)).slice(0)));
  }

  private fetchBytes(id: string): Promise<ArrayBuffer> {
    const found = this.bytes.get(id);
    if (found) return found;
    const url = this.options.loader?.resolve?.(id).url ?? this.options.resolveUrl(id);
    const request = this.options.fetch(url).then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.arrayBuffer();
    });
    this.bytes.set(id, request);
    return request;
  }

  private async safe(id: string, load: () => Promise<AudioBuffer>): Promise<AudioBuffer | null> {
    try {
      return await load();
    } catch (error) {
      if (!this.warned.has(id)) {
        this.warned.add(id);
        this.options.logger.warn('audio', id, error);
      }
      return null;
    }
  }
}

export interface PlayOptions {
  vol?: number;
  pitch?: number;
  rate?: number;
  bus?: BusName;
  at?: number;
}

export interface AudioHandle {
  stop(): void;
}

interface ActiveHandle extends AudioHandle {
  stopped: boolean;
  source?: AudioBufferSourceNode;
}

export class SamplePlayer {
  private readonly handles = new Set<ActiveHandle>();

  constructor(
    private readonly context: AudioContext,
    private readonly buses: AudioBuses,
    private readonly bank: SampleBank,
    private readonly random: () => number,
  ) {}

  play(id: string, options: PlayOptions = {}): AudioHandle | null {
    if (this.context.state !== 'running') return null;
    const handle: ActiveHandle = {
      stopped: false,
      stop: () => {
        handle.stopped = true;
        handle.source?.stop();
        this.handles.delete(handle);
      },
    };
    this.handles.add(handle);
    void this.start(id, options, handle);
    return handle;
  }

  stopAll(): void {
    for (const handle of [...this.handles]) handle.stop();
  }

  private async start(id: string, options: PlayOptions, handle: ActiveHandle): Promise<void> {
    const buffer = await this.bank.load(id);
    if (!buffer || handle.stopped || this.context.state !== 'running') {
      this.handles.delete(handle);
      return;
    }

    const { vol = 1, pitch = 0.06, rate = 1, bus = 'sfx', at = this.context.currentTime } = options;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = rate * (1 + (this.random() * 2 - 1) * pitch);
    gain.gain.value = vol;
    source.connect(gain).connect(this.buses[bus]);
    source.start(at);
    source.addEventListener?.('ended', () => this.handles.delete(handle), { once: true });
    handle.source = source;
  }
}
