import { LIMITS, LIMITS_V2 } from '@ogm/contracts';

export type EndReason = 'host-left' | 'owner-closed' | 'idle' | 'revoked' | 'abandoned';

export type RoomTimings = {
  ownerReconnectSec: number;
  playerReconnectSec: number;
  /** A v2 seat's rejoin window, for every seat including the creator's (#497 §3.6). */
  seatReconnectSec: number;
  idleDisposeSec: number;
  callbackTimeoutMs: number;
  callbackRetryMs: readonly number[];
};

export const DEFAULT_ROOM_TIMINGS: RoomTimings = {
  ownerReconnectSec: LIMITS.ownerReconnectSec,
  playerReconnectSec: LIMITS.playerReconnectSec,
  seatReconnectSec: LIMITS_V2.seatReconnectSec,
  idleDisposeSec: LIMITS.idleDisposeSec,
  callbackTimeoutMs: 5_000,
  callbackRetryMs: [250, 1_000, 4_000],
};

export function roomTimings(overrides?: Partial<RoomTimings>): RoomTimings {
  return {
    ...DEFAULT_ROOM_TIMINGS,
    ...overrides,
    callbackRetryMs: overrides?.callbackRetryMs ?? DEFAULT_ROOM_TIMINGS.callbackRetryMs,
  };
}

export async function postEnded(input: {
  apiInternalUrl: string;
  fetchFn: typeof fetch;
  internalSecret: string;
  reason: EndReason;
  retryMs: readonly number[];
  roomId: string;
  timeoutMs: number;
}): Promise<{ endedAt: string; ok: boolean }> {
  const endedAt = new Date().toISOString();
  const url = `${input.apiInternalUrl.replace(/\/$/, '')}/internal/rooms/${encodeURIComponent(input.roomId)}/ended`;

  for (let attempt = 0; attempt <= input.retryMs.length; attempt += 1) {
    try {
      const response = await input.fetchFn(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${input.internalSecret}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ reason: input.reason, endedAt }),
        signal: AbortSignal.timeout(input.timeoutMs),
      });
      if (response.ok) return { endedAt, ok: true };
    } catch {
      // Retry below; no environment value or response body is logged.
    }

    const delay = input.retryMs[attempt];
    if (delay !== undefined) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return { endedAt, ok: false };
}
