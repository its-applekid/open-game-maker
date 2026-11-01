declare const sampleRate: number;
declare function registerProcessor(name: string, processor: new () => AudioWorkletProcessor): void;

declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  process(inputs: Float32Array[][]): boolean;
}

class OgmCaptureProcessor extends AudioWorkletProcessor {
  private readonly chunkSize = Math.round(sampleRate / 10);
  private pending = new Float32Array(this.chunkSize);
  private written = 0;

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0];
    if (!input) return true;

    let offset = 0;
    while (offset < input.length) {
      const available = this.chunkSize - this.written;
      const length = Math.min(available, input.length - offset);
      this.pending.set(input.subarray(offset, offset + length), this.written);
      this.written += length;
      offset += length;

      if (this.written === this.chunkSize) {
        const chunk = this.pending;
        this.port.postMessage(chunk, [chunk.buffer]);
        this.pending = new Float32Array(this.chunkSize);
        this.written = 0;
      }
    }
    return true;
  }
}

registerProcessor('ogm-capture', OgmCaptureProcessor);

export {};
