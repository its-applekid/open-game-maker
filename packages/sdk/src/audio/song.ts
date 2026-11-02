import { songSchema, type SongNote, type SongTrack } from './song.schema.js';

export type ToneModule = typeof import('tone');
export type ToneLoader = () => Promise<ToneModule>;

export interface SongHandle {
  stop(): void;
}

interface Instrument {
  connect(destination: AudioNode): unknown;
  triggerAttackRelease(note: string, duration: string, time: number, velocity?: number): unknown;
  volume: { value: number };
  dispose(): void;
}

interface PartHandle {
  start(time?: number | string): PartHandle;
  dispose(): void;
}

interface TransportHandle {
  bpm: { value: number };
  loop: boolean;
  loopEnd: string;
  start(): void;
  stop(): void;
  cancel(): void;
}

interface ActiveSong {
  parts: PartHandle[];
  instruments: Instrument[];
  transport: TransportHandle;
}

export class SongPlayer {
  private active: ActiveSong | null = null;
  private generation = 0;

  constructor(
    private readonly context: AudioContext,
    private readonly musicBus: GainNode,
    private readonly loadTone: ToneLoader,
    private readonly resolveUrl: (id: string) => string,
  ) {}

  async play(input: unknown): Promise<SongHandle> {
    const song = songSchema.parse(input);
    const generation = ++this.generation;
    const Tone = await this.loadTone();
    if (generation !== this.generation) return { stop() {} };
    (Tone.setContext as unknown as (context: AudioContext) => void)(this.context);
    this.stopActive(this.active);

    const instruments: Instrument[] = [];
    const parts: PartHandle[] = [];
    const transport = Tone.getTransport() as unknown as TransportHandle;
    try {
      for (const track of song.tracks) {
        const instrument = createInstrument(Tone, track, this.resolveUrl);
        if (track.volumeDb !== undefined) instrument.volume.value = track.volumeDb;
        instrument.connect(this.musicBus);
        instruments.push(instrument);

        const Part = Tone.Part as unknown as new (
          callback: (time: number, note: SongNote) => void,
          events: Array<[string, SongNote]>,
        ) => PartHandle;
        const part = new Part(
          (time, note) => instrument.triggerAttackRelease(note.n, note.d, time, note.v ?? 1),
          track.pattern.map((note) => [note.t, note]),
        ).start(0);
        parts.push(part);
      }

      transport.bpm.value = song.bpm;
      transport.loop = true;
      transport.loopEnd = `${song.loopBars}m`;
      transport.start();
      const active = { parts, instruments, transport };
      this.active = active;
      return { stop: () => this.stopActive(active) };
    } catch (error) {
      for (const part of parts) part.dispose();
      for (const instrument of instruments) instrument.dispose();
      throw error;
    }
  }

  stop(): void {
    this.generation += 1;
    this.stopActive(this.active);
  }

  private stopActive(active: ActiveSong | null): void {
    if (!active || this.active !== active) return;
    active.transport.stop();
    active.transport.cancel();
    for (const part of active.parts) part.dispose();
    for (const instrument of active.instruments) instrument.dispose();
    this.active = null;
  }
}

function createInstrument(Tone: ToneModule, track: SongTrack, resolveUrl: (id: string) => string): Instrument {
  switch (track.instrument) {
    case 'synth':
      return new Tone.Synth() as unknown as Instrument;
    case 'fm':
      return new Tone.FMSynth() as unknown as Instrument;
    case 'membrane':
      return new Tone.MembraneSynth() as unknown as Instrument;
    case 'pluck':
      return new Tone.PluckSynth() as unknown as Instrument;
    case 'sampler':
      return new Tone.Sampler({
        urls: Object.fromEntries(Object.entries(track.sampler!).map(([note, asset]) => [note, resolveUrl(asset)])),
      }) as unknown as Instrument;
  }
}
