import type { Lease, LeaseResult } from './api';

type LeaseApi = {
  acquire(): Promise<LeaseResult>;
  heartbeat(token: number): Promise<LeaseResult>;
  release(token: number): Promise<LeaseResult>;
};

export type LeaseControllerOptions = {
  api: LeaseApi;
  heartbeatMs?: number;
  onLost(holder: string): void;
  onError?(message: string): void;
  onRecovered?(): void;
};

export class LeaseController {
  private lease: Lease | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private stopped = true;
  private heartbeatInFlight = false;
  private generation = 0;

  constructor(private readonly options: LeaseControllerOptions) {}

  get token(): number | undefined {
    return this.lease?.token;
  }

  async start(): Promise<LeaseResult> {
    if (!this.stopped) await this.stop();
    this.stopped = false;
    const generation = ++this.generation;
    const result = await this.options.api.acquire();
    if (this.stopped || generation !== this.generation) {
      if (result.ok) await this.options.api.release(result.lease.token);
      return result;
    }
    if (!result.ok) {
      this.stopped = true;
      this.report(result);
      return result;
    }

    this.lease = result.lease;
    this.timer = setInterval(() => void this.heartbeat(), this.options.heartbeatMs ?? 15_000);
    return result;
  }

  async stop(): Promise<void> {
    this.generation += 1;
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    const token = this.lease?.token;
    this.lease = undefined;
    if (token === undefined) return;
    const result = await this.options.api.release(token);
    if (!result.ok) this.report(result);
  }

  private async heartbeat(): Promise<void> {
    const token = this.lease?.token;
    if (this.stopped || token === undefined || this.heartbeatInFlight) return;
    this.heartbeatInFlight = true;
    try {
      const result = await this.options.api.heartbeat(token);
      if (result.ok) {
        this.lease = result.lease;
        this.options.onRecovered?.();
        return;
      }
      this.report(result);
      if (result.kind === 'lease-lost') {
        this.stopped = true;
        this.lease = undefined;
        if (this.timer !== undefined) clearInterval(this.timer);
        this.timer = undefined;
      }
    } finally {
      this.heartbeatInFlight = false;
    }
  }

  private report(result: Exclude<LeaseResult, { ok: true }>): void {
    if (result.kind === 'lease-lost') this.options.onLost(result.holder);
    else this.options.onError?.(result.message);
  }
}
