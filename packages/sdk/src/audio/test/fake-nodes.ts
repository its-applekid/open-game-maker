export class FakeAudioParam {
  value = 1;
  readonly targets: Array<[number, number, number]> = [];
  readonly values: Array<[number, number]> = [];

  cancelScheduledValues(): this {
    return this;
  }

  setTargetAtTime(value: number, start: number, constant: number): this {
    this.value = value;
    this.targets.push([value, start, constant]);
    return this;
  }

  setValueAtTime(value: number, start: number): this {
    this.value = value;
    this.values.push([value, start]);
    return this;
  }
}

export class FakeAudioNode {
  readonly connections: unknown[] = [];

  connect<T>(destination: T): T {
    this.connections.push(destination);
    return destination;
  }

  disconnect(): void {}
}

export class FakeGainNode extends FakeAudioNode {
  readonly gain = new FakeAudioParam();
}

export class FakeAudioBuffer {
  readonly duration: number;
  readonly numberOfChannels: number;
  readonly channels: Float32Array[];

  constructor(
    readonly length = 44_100,
    readonly sampleRate = 44_100,
    channels = 1,
  ) {
    this.duration = length / sampleRate;
    this.numberOfChannels = channels;
    this.channels = Array.from({ length: channels }, () => new Float32Array(length));
  }

  getChannelData(channel: number): Float32Array {
    return this.channels[channel]!;
  }

  copyToChannel(source: Float32Array, channel: number): void {
    this.channels[channel]!.set(source);
  }
}

export class FakeBufferSource extends FakeAudioNode {
  buffer: FakeAudioBuffer | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  readonly playbackRate = new FakeAudioParam();
  readonly starts: Array<[number, number]> = [];
  readonly stops: number[] = [];

  start(when = 0, offset = 0): void {
    this.starts.push([when, offset]);
  }

  stop(when = 0): void {
    this.stops.push(when);
  }
}
