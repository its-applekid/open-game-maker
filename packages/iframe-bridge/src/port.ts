import { BRIDGE_MAX_BYTES, BRIDGE_MAX_MSGS_PER_S, type Envelope } from '@ogm/contracts';
import { BridgeError } from './errors.js';
import { TokenBucket } from './limits.js';
import type { Bridge, BridgeStats, Validator } from './types.js';

// prettier-ignore
export interface PortOptions { validate: Validator; onMessage: (env: Envelope<string, unknown>) => void; now?: () => number; }
// prettier-ignore
interface HandshakeOptions extends PortOptions { localWindow: Window; origin: string; source?: MessageEventSource | null; cleanup?: () => void; }
// prettier-ignore
type Pending = { resolve: (value: unknown) => void; reject: (error: BridgeError) => void; timer: ReturnType<typeof setTimeout>; };
type Drop = keyof BridgeStats['dropped'];
const zeroStats = (): BridgeStats => ({ dropped: { tooLarge: 0, rateLimited: 0, invalid: 0 }, sent: 0, received: 0 });

// prettier-ignore
export class PortBridge implements Bridge {
  readonly ready: Promise<void>;
  private readonly state = zeroStats();
  private readonly bucket = new TokenBucket(BRIDGE_MAX_MSGS_PER_S, BRIDGE_MAX_MSGS_PER_S);
  private readonly pending = new Map<string, Pending>();
  private port: MessagePort | undefined;
  private settled = false;
  private closed = false;
  private lastError = -Infinity;
  private errorId = 0;
  private resolveReady!: () => void;
  private rejectReady!: (error: BridgeError) => void;
  constructor(private readonly opts: PortOptions, private readonly cleanup = () => undefined) {
    this.ready = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
  }
  attach(port: MessagePort): void {
    if (this.settled) return port.close();
    this.port = port;
    this.settled = true;
    port.onmessage = ({ data }) => this.receive(data);
    port.start();
    this.cleanup();
    this.resolveReady();
  }
  fail(error: BridgeError): void {
    if (this.settled) return;
    this.settled = true;
    this.cleanup();
    this.rejectReady(error);
  }
  send(env: Envelope<string, unknown>): void {
    if (!this.port) throw new BridgeError(this.closed ? 'closed' : 'not_ready');
    const data = JSON.stringify(env);
    if (data.length > BRIDGE_MAX_BYTES) throw new BridgeError('too_large');
    this.port.postMessage(data);
    this.state.sent += 1;
  }
  request<R>(env: Envelope<string, unknown>, timeoutMs = 5000): Promise<R> {
    if (!this.port) return Promise.reject(new BridgeError(this.closed ? 'closed' : 'not_ready'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(env.id);
        reject(new BridgeError('timeout'));
      }, timeoutMs);
      this.pending.set(env.id, { resolve: resolve as (value: unknown) => void, reject, timer });
      try { this.send(env); }
      catch (error) {
        clearTimeout(timer);
        this.pending.delete(env.id);
        reject(error);
      }
    });
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.port?.close();
    if (!this.settled) this.fail(new BridgeError('closed'));
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(new BridgeError('closed'));
    }
    this.pending.clear();
  }
  stats(): BridgeStats {
    return { ...this.state, dropped: { ...this.state.dropped } };
  }
  private receive(data: unknown): void {
    if (this.closed) return;
    if (typeof data !== 'string') return this.drop('invalid');
    if (data.length > BRIDGE_MAX_BYTES) return this.drop('tooLarge');
    if (!this.bucket.take(this.now())) return this.drop('rateLimited');
    let env: Envelope<string, unknown> | null;
    try { env = this.opts.validate(JSON.parse(data)); }
    catch { return this.drop('invalid'); }
    if (!env) return this.drop('invalid');
    this.state.received += 1;
    const request = env.replyTo ? this.pending.get(env.replyTo) : undefined;
    if (!request) return this.opts.onMessage(env);
    this.pending.delete(env.replyTo!);
    clearTimeout(request.timer);
    request.resolve(env);
  }
  private drop(kind: Drop): void {
    this.state.dropped[kind] += 1;
    const now = this.now();
    if (now - this.lastError < 1000) return;
    this.lastError = now;
    this.send({
      v: 1, id: `bridge-error-${++this.errorId}`, t: 'error',
      payload: { code: 'dropped', message: `tooLarge=${this.state.dropped.tooLarge} rateLimited=${this.state.dropped.rateLimited} invalid=${this.state.dropped.invalid}` },
    });
  }
  private now(): number {
    return this.opts.now ? this.opts.now() : performance.now();
  }
}

export function attachPort(port: MessagePort, opts: PortOptions): Bridge {
  const bridge = new PortBridge(opts);
  bridge.attach(port);
  return bridge;
}
// prettier-ignore
export function waitForHello(
  opts: HandshakeOptions,
  accept: (event: MessageEvent, connect: (port: MessagePort) => void) => void,
): PortBridge {
  const bridge = new PortBridge(opts, () => {
    opts.localWindow.removeEventListener('message', listener);
    opts.cleanup?.();
  });
  const listener = (event: MessageEvent) => {
    if (event.origin !== opts.origin || (opts.source !== undefined && event.source !== opts.source)) return;
    if (typeof event.data !== 'string' || event.data.length > BRIDGE_MAX_BYTES) return;
    let env: Envelope<string, unknown> | null;
    try { env = opts.validate(JSON.parse(event.data)); }
    catch { return; }
    if (env?.t !== 'hello') return;
    accept(event, (port) => {
      bridge.attach(port);
      queueMicrotask(() => opts.onMessage(env!));
    });
  };
  opts.localWindow.addEventListener('message', listener);
  return bridge;
}
