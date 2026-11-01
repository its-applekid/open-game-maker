import type { Envelope } from '@ogm/contracts';
export type Validator = (raw: unknown) => Envelope<string, unknown> | null;
// prettier-ignore
export type BridgeStats = { dropped: { tooLarge: number; rateLimited: number; invalid: number }; sent: number; received: number };
// prettier-ignore
export interface Bridge { ready: Promise<void>; send(env: Envelope<string, unknown>): void; request<R = Envelope<string, unknown>>(env: Envelope<string, unknown>, timeoutMs?: number): Promise<R>; close(): void; stats(): BridgeStats; }
