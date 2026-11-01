import { FakeAudioBuffer, FakeAudioNode, FakeBufferSource, FakeGainNode } from './fake-nodes.js';

export { FakeAudioBuffer, FakeAudioNode, FakeBufferSource, FakeGainNode } from './fake-nodes.js';

export class FakeAudioContext extends EventTarget {
  state: AudioContextState | 'interrupted' = 'suspended';
  currentTime = 4;
  sampleRate = 44_100;
  readonly destination = new FakeAudioNode();
  readonly gains: FakeGainNode[] = [];
  readonly sources: FakeBufferSource[] = [];
  readonly buffers: FakeAudioBuffer[] = [];
  readonly decoded = new FakeAudioBuffer();
  resumeCalls = 0;
  suspendCalls = 0;

  createGain(): FakeGainNode {
    const gain = new FakeGainNode();
    this.gains.push(gain);
    return gain;
  }

  createBufferSource(): FakeBufferSource {
    const source = new FakeBufferSource();
    this.sources.push(source);
    return source;
  }

  createBuffer(channels: number, length: number, sampleRate: number): FakeAudioBuffer {
    const buffer = new FakeAudioBuffer(length, sampleRate, channels);
    this.buffers.push(buffer);
    return buffer;
  }

  async decodeAudioData(): Promise<FakeAudioBuffer> {
    return this.decoded;
  }

  async resume(): Promise<void> {
    this.resumeCalls += 1;
    this.state = 'running';
    this.dispatchEvent(new Event('statechange'));
  }

  async suspend(): Promise<void> {
    this.suspendCalls += 1;
    this.state = 'suspended';
  }

  async close(): Promise<void> {
    this.state = 'closed';
  }
}

export class FakeWindow extends EventTarget {
  readonly document = Object.assign(new EventTarget(), { hidden: false });
  readonly navigator: { audioSession?: { type: string } } = {};
}

export function contextConstructor(context: FakeAudioContext): typeof AudioContext {
  return class {
    constructor() {
      return context;
    }
  } as unknown as typeof AudioContext;
}

export const asAudioBuffer = (buffer: FakeAudioBuffer): AudioBuffer => buffer as unknown as AudioBuffer;
export const asWindow = (value: FakeWindow): Window => value as unknown as Window;
